import express, {Request, Response, NextFunction} from 'express';
import fs from 'fs';
import yaml from 'js-yaml';

import exec from './exec';
import github from './github';
import log, {setLogFile} from './log';
import timestamp from './timestamp';

const getRepoPath = (repo: string) => `${process.env.WORK_DIR}/${repo}`;
const getConfigFilePath = (repo: string) => `${getRepoPath(repo)}/bomba.yml`;
const getSourceEnvFilePath = (repo: string) => `${process.env.WORK_DIR}/.${repo.replace('/', '_')}`;
const getTargetEnvFilePath = (repo: string, envFileName: string) =>
    `${getRepoPath(repo)}/${envFileName}`;

interface PipelineConfig {
    env?: string;
    build: Array<{name: string; command: string}>;
    test: Array<{name: string; command: string}>;
}

interface HttpException {
    error: Error;
    status: number;
}

const app = express();
app.use(express.json());
app.use('/logs', express.static('logs'));

app.post(process.env.WEBHOOK_ENDPOINT_SUFFIX!, async (req: Request, res: Response) => {
    // make sure that the webhook request is actually made by Github
    if (github.verifyWebhookSignature(req)) {
        return res.status(500).json({message: 'Webhook signature could not be verified.'});
    }

    // ignore events other than pull requests
    if (req.headers['x-github-event'] !== 'pull_request') {
        return res.send({message: 'Ignoring event types other than pull requests.'});
    }

    // cache pull request, commit & branch info
    const pr = req.body.pull_request;
    const commit = pr.head;
    const repo = commit.repo.full_name;
    const branch = commit.ref;

    // select a timestamped log file name based on current repo and branch names
    const logFileName = `${timestamp()}-${repo.replace('/', '_')}-${pr.number}`;
    setLogFile(logFileName);

    // send ACK response before starting the CI process
    res.send(`Started processing PR #${pr.number}: ${pr.url}`);

    // initialize & read CI config
    let cfg: PipelineConfig = {build: [], test: []};
    try {
        await exec(`rm -rf ${getRepoPath(repo)}`);
        await exec(
            `git clone --single-branch -b ${branch} ${commit.repo.ssh_url} ${getRepoPath(repo)}`
        );
        const file = fs.readFileSync(`${getConfigFilePath(repo)}`, 'utf8');
        cfg = yaml.safeLoad(file);
        if (cfg.env) {
            await exec(`cp ${getSourceEnvFilePath(repo)} ${getTargetEnvFilePath(repo, cfg.env)}`);
        }
        await cfg.build.map((item) =>
            github.setStatus(
                repo,
                commit.sha,
                'pending',
                `build-${item.name}`,
                'build task queued',
                logFileName
            )
        );
    } catch (err) {
        await cfg.build.map((item) =>
            github.setStatus(
                repo,
                commit.sha,
                'error',
                `build-${item.name}`,
                err.cmd || err,
                logFileName
            )
        );
        log.error(`Error occured while initializing the CI process: ${err}`);
        return;
    }

    // build components one by one
    for (let i = 0; i < cfg.build.length; i++) {
        const context = `build-${cfg.build[i].name}`;
        try {
            await exec(`cd ${getRepoPath(repo)} && ${cfg.build[i].command}`);
            await github.setStatus(
                repo,
                commit.sha,
                'success',
                context,
                'build successful',
                logFileName
            );
        } catch (err) {
            await github.setStatus(repo, commit.sha, 'error', context, err.cmd || err, logFileName);
            log.error(`Error occured while building ${cfg.build[i].name}: ${err}`);
        }
    }

    // test components one by one
    for (let i = 0; i < cfg.test.length; i++) {
        const context = `test-${cfg.test[i].name}`;
        try {
            await exec(`cd ${getRepoPath(repo)} && ${cfg.test[i].command}`);
            await github.setStatus(
                repo,
                commit.sha,
                'success',
                context,
                'test successful',
                logFileName
            );
        } catch (err) {
            await github.setStatus(repo, commit.sha, 'error', context, err.cmd || err, logFileName);
            log.error(`Error occured while testing ${cfg.test[i].name}: ${err}`);
        }
    }
    log.info(`Finished processing PR: ${pr['url']}`);
});

// handle invalid routes
app.use((req, res, next: NextFunction) => {
    const exception: HttpException = {
        error: new Error('Not found'),
        status: 404
    };
    next(exception);
});

// handle other errors
app.use((exception: HttpException, req: Request, res: Response) => {
    log.error(`Fatal error: ${exception.error.message}`);
    res.status(exception.status || 500);
    res.json({
        error: {
            message: exception.error.message
        }
    });
});

app.listen(process.env.SERVER_PORT, () =>
    log.info(`Server started on port ${process.env.SERVER_PORT}`)
);

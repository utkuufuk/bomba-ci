import express, {Request, Response, NextFunction} from 'express';
import fs from 'fs';
import morgan from 'morgan';
import yaml from 'js-yaml';

import github from './github';
import exec from './exec';

const getRepoPath = (repo: string) => `${process.env.WORK_DIR}/${repo}`;
const getConfigFilePath = (repo: string) => `${getRepoPath(repo)}/bomba.yml`;
const getSourceEnvFilePath = (repo: string) => `${process.env.WORK_DIR}/.${repo.replace('/', '_')}`;
const getTargetEnvFilePath = (repo: string, envFileName: string) =>
    `${getRepoPath(repo)}/${envFileName}`;

interface PipelineConfig {
    env?: string;
    build: Array<{name: string; command: string}>;
}

interface HttpException {
    error: Error;
    status: number;
}

const app = express();
app.use(morgan('dev'));
app.use(express.json());

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

    // send ACK response before starting the CI process
    res.send(`Started processing PR #${pr.number}: ${pr.url}`);

    // initialize & read CI config
    let cfg: PipelineConfig = {build: []};
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
            github.setStatus(repo, commit.sha, 'pending', `build-${item.name}`, 'build task queued')
        );
    } catch (err) {
        await cfg.build.map((item) =>
            github.setStatus(repo, commit.sha, 'error', `build-${item.name}`, err.cmd || err)
        );
        console.error(`Error occured while initializing the CI process: ${err}`);
    }

    // build components one by one
    for (let i = 0; i < cfg.build.length; i++) {
        const context = `build-${cfg.build[i].name}`;
        try {
            await exec(`cd ${getRepoPath(repo)} && ${cfg.build[i].command}`);
            await github.setStatus(repo, commit.sha, 'success', context, 'build successful');
        } catch (err) {
            await github.setStatus(repo, commit.sha, 'error', context, err.cmd || err);
            console.error(`Error occured while building ${cfg.build[i].name}: ${err}`);
        }
    }
    console.log(`Finished processing PR: ${pr['url']}`);
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
    console.error(`Fatal error: ${exception.error.message}`);
    res.status(exception.status || 500);
    res.json({
        error: {
            message: exception.error.message
        }
    });
});

app.listen(process.env.WEBHOOK_ENDPOINT_PORT, () =>
    console.log(`Server started on port ${process.env.WEBHOOK_ENDPOINT_PORT}`)
);

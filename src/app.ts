import express, {Request, Response, NextFunction} from 'express';
import fs from 'fs';
import yaml from 'js-yaml';

import exec from './exec';
import github, {State} from './github';
import log, {setLogFile} from './log';
import timestamp from './timestamp';

const repoPath = (repo: string) => `${process.env.WORK_DIR}/${repo}`;

export interface IStage {
    initialize?: string;
    finalize?: string;
    steps: Array<{name: string; command: string}>;
}

interface IPipelineConfig {
    env?: string;
    build?: IStage;
    test?: IStage;
}

interface IHttpException {
    error: Error;
    status: number;
}

const app = express();
app.use(express.json());
app.use('/logs', express.static('logs'));

app.post(process.env.WEBHOOK_ENDPOINT_SUFFIX!, async (req: Request, res: Response) => {
    // make sure that the webhook request is actually made by Github
    if (github.verifySignature(req)) {
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
    let cfg: IPipelineConfig = {};
    try {
        await exec(`rm -rf ${repoPath(repo)}`);
        await exec(
            `git clone --single-branch -b ${branch} ${commit.repo.ssh_url} ${repoPath(repo)}`
        );
        const file = fs.readFileSync(`${repoPath(repo)}/bomba.yml`, 'utf8');
        cfg = yaml.safeLoad(file);
        console.log(`Bomba.yml loaded:\n${cfg}`);
        if (cfg.env) {
            await exec(
                `cp ${process.env.WORK_DIR}/.${repo.replace('/', '_')} ${repoPath(repo)}/${cfg.env}`
            );
        }
        github.batchStatus(repo, commit.sha, 'build', State.PENDING, cfg.build!, logFileName);
        github.batchStatus(repo, commit.sha, 'test', State.PENDING, cfg.test!, logFileName);
    } catch (err) {
        log.error(`Error occured while initializing the CI process: ${err}`);
        github.batchStatus(repo, commit.sha, 'build', State.ERROR, cfg.build!, logFileName);
        github.batchStatus(repo, commit.sha, 'test', State.ERROR, cfg.test!, logFileName);
        return;
    }

    if (cfg.build) {
        // run initialization script for build stage
        cfg.build.initialize && (await exec(`cd ${repoPath(repo)} && ${cfg.build.initialize}`));

        // build each component
        for (let i = 0; i < cfg.build.steps.length; i++) {
            const context = `build-${cfg.build.steps[i].name}`;
            try {
                await exec(`cd ${repoPath(repo)} && ${cfg.build.steps[i].command}`);
                await github.setStatus(repo, commit.sha, context, State.SUCCESS, logFileName);
            } catch (err) {
                log.error(`Error occured while building ${cfg.build.steps[i].name}: ${err}`);
                await github.setStatus(repo, commit.sha, context, State.FAILURE, logFileName);
            }
        }

        // run finalization script for build stage
        cfg.build.finalize && (await exec(`cd ${repoPath(repo)} && ${cfg.build.finalize}`));
    }

    if (cfg.test) {
        // run initialization script for test stage
        cfg.test.initialize && (await exec(`cd ${repoPath(repo)} && ${cfg.test.initialize}`));

        // test each component
        for (let i = 0; i < cfg.test.steps.length; i++) {
            const context = `test-${cfg.test.steps[i].name}`;
            try {
                await exec(`cd ${repoPath(repo)} && ${cfg.test.steps[i].command}`);
                await github.setStatus(repo, commit.sha, context, State.SUCCESS, logFileName);
            } catch (err) {
                log.error(`Error occured while testing ${cfg.test.steps[i].name}: ${err}`);
                await github.setStatus(repo, commit.sha, context, State.FAILURE, logFileName);
            }
        }

        // run finalization script for test stage
        cfg.test.finalize && (await exec(`cd ${repoPath(repo)} && ${cfg.test.finalize}`));
    }

    log.info(`CI pipeline completed for PR: ${pr['url']}`);
});

// handle invalid routes
app.use((req, res, next: NextFunction) => {
    const exception: IHttpException = {
        error: new Error('Not found'),
        status: 404
    };
    next(exception);
});

// handle other errors
app.use((exception: IHttpException, req: Request, res: Response) => {
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

import express, {Request, Response, NextFunction} from 'express';
import morgan from 'morgan';
import yaml from 'js-yaml';
import fs from 'fs';

import * as github from './github';
import exec from './exec';

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

    // send ACK response before starting the CI process
    const pr = req.body.pull_request;
    const sha = pr.head.sha;
    res.send(`Started processing PR #${pr.number}: ${pr.url}`);

    // initialize & read CI config
    let cfg: PipelineConfig = {build: []};
    try {
        await exec(`rm -rf ${process.env.WORK_DIR}/repo`);
        await exec(
            `git clone --single-branch --branch \
            ${pr.head.ref} ${pr.head.repo.ssh_url} ${process.env.WORK_DIR}/repo`
        );
        const file = fs.readFileSync(`${process.env.WORK_DIR}/repo/github-ci.yml`, 'utf8');
        cfg = yaml.safeLoad(file);

        if (cfg.env) {
            await exec(
                `cp ${process.env.WORK_DIR}/${cfg.env} ${process.env.WORK_DIR}/repo/${cfg.env}`
            );
        }
        await github.sendStatusCheck(sha, 'pending', 'build', 'build tasks queued');
        await cfg.build.map((item) =>
            github.sendStatusCheck(sha, 'pending', `build-${item.name}`, 'build task queued')
        );
    } catch (err) {
        await github.sendStatusCheck(sha, 'error', 'build', err.cmd || err);
        console.error(`Error occured while initializing the CI process: ${err}`);
    }

    // build components one by one
    for (let i = 0; i < cfg.build.length; i++) {
        const context = `build-${cfg.build[i].name}`;
        try {
            await exec(`cd ${process.env.WORK_DIR}/repo && ${cfg.build[i].command}`);
            await github.sendStatusCheck(sha, 'success', context, 'build successful');
        } catch (err) {
            await github.sendStatusCheck(sha, 'error', context, err.cmd || err);
            console.error(`Error occured while building ${cfg.build[i].name}: ${err}`);
        }
    }

    // set 'build' status check as 'success' after all components have been successfully built
    await github.sendStatusCheck(sha, 'success', 'build', 'build successful');
    console.log(`Finished processing the PR: ${pr['url']}`);
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

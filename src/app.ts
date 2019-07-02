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

app.post(process.env.WEBHOOK_ENDPOINT_SUFFIX!, (req: Request, res: Response) => {
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
    let promise = exec(`rm -rf ${process.env.WORK_DIR}/repo`)
        // clone branch
        .then(() => {
            const cloneCmd =
                `git clone --single-branch --branch ` +
                `${pr.head.ref} ${pr.head.repo.ssh_url} ${process.env.WORK_DIR}/repo`;
            return exec(cloneCmd);
        })
        // load 'github-ci.yml'
        .then(() => {
            const file = fs.readFileSync(`${process.env.WORK_DIR}/repo/github-ci.yml`, 'utf8');
            cfg = yaml.safeLoad(file);
            return cfg;
        })
        // copy env file into project root
        .then(({env}) =>
            env === null
                ? Promise.resolve()
                : exec(`cp ${process.env.WORK_DIR}/${env} ${process.env.WORK_DIR}/repo/${env}`)
        )
        // set all status checks as 'pending'
        .then(() => github.sendStatusCheck(sha, 'pending', 'build', 'build tasks queued'))
        .then(() =>
            cfg.build.map((item) =>
                github.sendStatusCheck(sha, 'pending', `build-${item.name}`, 'build task queued')
            )
        )
        .catch((err) => {
            github.sendStatusCheck(sha, 'error', 'build', err.cmd || err).then(() => {
                console.error(`Error occured while initializing the CI process: ${err}`);
            });
        });

    // build components one by one
    return promise.then(() => {
        for (let i = 0; i < cfg.build.length; i++) {
            const context = `build-${cfg.build[i].name}`;
            promise = promise
                .then(() => exec(`cd ${process.env.WORK_DIR}/repo && ${cfg.build[i].command}`))
                .then(() => github.sendStatusCheck(sha, 'success', context, 'build successful'))
                .catch((err) => {
                    github.sendStatusCheck(sha, 'error', context, err.cmd || err).then(() => {
                        console.error(`Error occured while building ${cfg.build[i].name}: ${err}`);
                    });
                });
        }

        // set 'build' status check as 'success' after all components have been successfully built
        promise
            .then(() => {
                github.sendStatusCheck(sha, 'success', 'build', 'build successful').then(() => {
                    console.log(`Finished processing the PR: ${pr['url']}`);
                });
            })
            .catch((err) => {
                github.sendStatusCheck(sha, 'error', 'build', err.cmd || err).then(() => {
                    console.error(`Error occured during the build process: ${err}`);
                });
            });
    });
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

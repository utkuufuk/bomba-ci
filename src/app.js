const express = require('express');
const morgan = require('morgan');

const github = require('./github');
const shell = require('./shell');
const yaml = require('./yaml');

const app = express();
app.use(morgan('dev'));
app.use(express.json());

app.post(process.env.WEBHOOK_ENDPOINT_SUFFIX, (req, res) => {
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
    let cfg = null;
    let promise = shell(`rm -rf ${process.env.WORK_DIR}/repo`)
        // clone branch
        .then(() => {
            const cloneCmd =
                `git clone --single-branch --branch ` +
                `${pr.head.ref} ${pr.head.repo.ssh_url} ${process.env.WORK_DIR}/repo`;
            return shell(cloneCmd);
        })
        // load 'github-ci.yml'
        .then(() => {
            cfg = yaml.load(`${process.env.WORK_DIR}/repo/github-ci.yml`);
            return;
        })
        // copy env file into project root
        .then(() => cfg.env &&
            shell(`cp ${process.env.WORK_DIR}/${cfg.env} ${process.env.WORK_DIR}/repo/${cfg.env}`)
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
                .then(() => shell(`cd ${process.env.WORK_DIR}/repo && ${cfg.build[i].command}`))
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
                github.sendStatusCheck(sha, 'error', context, err.cmd || err).then(() => {
                    console.error(`Error occured during the build process: ${err}`);
                });
            });
    });
});

// handle invalid routes
app.use((req, res, next) => {
    const error = new Error('Not found');
    error.status = 404;
    next(error);
});

// handle other errors
app.use((error, req, res, next) => {
    console.error(`Fatal error: ${error.message}`);
    res.status(error.status || 500);
    res.json({
        error: {
            message: error.message
        }
    });
});

app.listen(process.env.WEBHOOK_ENDPOINT_PORT, () =>
    console.log(`Server started on port ${process.env.WEBHOOK_ENDPOINT_PORT}`)
);

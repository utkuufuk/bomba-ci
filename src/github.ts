import axios from 'axios';
import crypto from 'crypto';
import express from 'express';

import log from './log';
import timestamp from './timestamp';

const HEADERS = {Authorization: `token ${process.env.GITHUB_ACCESS_TOKEN}`};

export enum State {
    ERROR = 'error',
    FAILURE = 'failure',
    PENDING = 'pending',
    SUCCESS = 'success'
}

const descriptions = {
    [State.ERROR]: 'could not be started',
    [State.FAILURE]: 'failed',
    [State.PENDING]: 'queued',
    [State.SUCCESS]: 'successful'
};

const getEndpoint = (repoName: string, sha: string) =>
    `https://api.github.com/repos/${repoName}/statuses/${sha}`;

const setStatus = async (
    repo: string,
    sha: string,
    context: string,
    state: State,
    fileName: string
) => {
    const payload = {
        context,
        state,
        description: `${timestamp()} — ${context} task ${descriptions[state]}`,
        target_url: `http://${process.env.HOST_IP}:${process.env.SERVER_PORT}/logs/${fileName}.log`
    };

    try {
        await axios.post(`${getEndpoint(repo, sha)}`, payload, {headers: HEADERS});
    } catch (err) {
        log.error(`Error occured while sending status check to GitHub: ${err}`);
    }
};

const batchStatus = async (
    repo: string,
    sha: string,
    context: string,
    state: State,
    items: Array<{name: string}>,
    fileName: string
) => {
    if (!items) {
        return;
    }
    await items.forEach(async (item) => {
        await setStatus(repo, sha, `${context}-${item.name}`, state, fileName);
    });
};

const verifySignature = (req: express.Request) => {
    const signature = req.headers['x-hub-signature'] as string;
    const hash = crypto
        .createHmac('sha1', process.env.WEBHOOK_SECRET!)
        .update(JSON.stringify(req.body))
        .digest('hex');
    return signature && signature.split('=')[1] !== hash;
};

export default {
    setStatus,
    batchStatus,
    verifySignature
};

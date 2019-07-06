import axios from 'axios';
import crypto from 'crypto';
import express from 'express';
import timestamp from './timestamp';

interface Status {
    state: string;
    context: string;
    description: string;
    target_url: string;
}

const HEADERS = {Authorization: `token ${process.env.GITHUB_ACCESS_TOKEN}`};

const getEndpoint = (repoName: string, sha: string) =>
    `https://api.github.com/repos/${repoName}/statuses/${sha}`;

const setStatus = async (
    repoName: string,
    sha: string,
    state: string,
    context: string,
    description: string,
    fileName: string
) => {
    const payload: Status = {
        state,
        context,
        description: `${timestamp()} — ${description}`,
        target_url: `http://${process.env.HOST_IP}:${process.env.SERVER_PORT}/logs/${fileName}.log`
    };

    try {
        await axios.post(`${getEndpoint(repoName, sha)}`, payload, {headers: HEADERS});
    } catch (err) {
        console.error(`Error occured while sending status check to GitHub: ${err}`);
    }
};

const verifyWebhookSignature = (req: express.Request) => {
    const signature = req.headers['x-hub-signature'] as string;
    const hash = crypto
        .createHmac('sha1', process.env.WEBHOOK_SECRET!)
        .update(JSON.stringify(req.body))
        .digest('hex');
    return signature && signature.split('=')[1] !== hash;
};

export default {
    setStatus,
    verifyWebhookSignature
};

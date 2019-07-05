import axios from 'axios';
import crypto from 'crypto';
import express from 'express';

const STATUS_ENDPOINT =
    `https://api.github.com/repos/` +
    `${process.env.GITHUB_USER}/${process.env.GITHUB_REPO}/statuses`;
const HEADERS = {Authorization: `token ${process.env.GITHUB_ACCESS_TOKEN}`};

const setStatus = async (sha: string, state: string, context: string, desc: string) => {
    const payload = {
        state,
        context,
        desc,
        target_url: 'https://http.cat/503'
    };

    try {
        await axios.post(`${STATUS_ENDPOINT}/${sha}`, payload, {headers: HEADERS});
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

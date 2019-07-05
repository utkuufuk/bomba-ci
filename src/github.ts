import axios from 'axios';
import crypto from 'crypto';
import express from 'express';

const ENDPOINT =
    `https://api.github.com/repos/` +
    `${process.env.GITHUB_USER}/${process.env.GITHUB_REPO}/statuses`;
const HEADERS = {Authorization: `token ${process.env.GITHUB_ACCESS_TOKEN}`};

export function sendStatusCheck(
    sha: string,
    state: string,
    context: string,
    description: string
): Promise<void> {
    const payload = {
        state,
        context,
        description,
        target_url: 'https://http.cat/503'
    };
    return new Promise((resolve, reject) => {
        axios
            .post(`${ENDPOINT}/${sha}`, payload, {headers: HEADERS})
            .then(() => resolve())
            .catch((err) => reject(err));
    });
}

export function verifyWebhookSignature(req: express.Request) {
    const signature = req.headers['x-hub-signature'] as string;
    const hash = crypto
        .createHmac('sha1', process.env.WEBHOOK_SECRET!)
        .update(JSON.stringify(req.body))
        .digest('hex');
    return signature && signature.split('=')[1] !== hash;
}

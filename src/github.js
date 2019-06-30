const axios = require('axios');
const crypto = require('crypto');

const ENDPOINT =
    `https://api.github.com/repos/` +
    `${process.env.GITHUB_USER}/${process.env.GITHUB_REPO}/statuses`;
const HEADERS = {Authorization: `token ${process.env.GITHUB_ACCESS_TOKEN}`};

sendStatusCheck = (sha, state, context, description) => {
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
};

verifyWebhookSignature = (req) => {
    const signature = req.headers['x-hub-signature'];
    const hash = crypto
        .createHmac('sha1', process.env.WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');
    return signature && signature.split('=')[1] !== hash;
};

module.exports = {
    sendStatusCheck,
    verifyWebhookSignature
};

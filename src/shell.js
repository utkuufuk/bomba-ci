const exec = require('child_process').exec;

module.exports = (cmd) => {
    console.log(`Running command: ${cmd}\n`);
    return new Promise((resolve, reject) => {
        exec(cmd, {stdio: 'pipe'}, (error, stdout, stderr) => {
            if (error) {
                stderr && console.error(`Stderr:\n${stderr}`);
                reject(error);
            }
            stdout && console.log(`Stdout:\n${stdout}`);
            resolve();
        });
    });
};

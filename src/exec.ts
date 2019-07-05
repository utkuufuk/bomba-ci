import child_process from 'child_process';

const exec = (cmd: string): Promise<void> => {
    console.log(`Running command: ${cmd}\n`);
    return new Promise((resolve, reject) => {
        child_process.exec(cmd, (error, stdout, stderr) => {
            if (error) {
                stderr && console.error(`Stderr:\n${stderr}`);
                reject(error);
            }
            stdout && console.log(`Stdout:\n${stdout}`);
            resolve();
        });
    });
};

export default exec;

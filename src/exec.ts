import child_process from 'child_process';
import log, {getLogFilePath} from './log';

const exec = (cmd: string): Promise<void> => {
    log.info(`Running command: ${cmd}\n`);
    cmd = `${cmd} >> ${getLogFilePath()}`;
    return new Promise((resolve, reject) => {
        child_process.exec(cmd, (error, stdout, stderr) => {
            if (error) {
                // stderr && log.error(stderr);
                reject(error);
            }
            // stdout && log.info(stdout);
            resolve();
        });
    });
};

export default exec;

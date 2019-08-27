import {createLogger, format, transports} from 'winston';
const {colorize, combine, timestamp, printf, simple} = format;

let logFilePath = '';

const logger = createLogger({
    level: 'info',
    format: combine(
        timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        format.errors({stack: true}),
        printf(({level, message, timestamp}) => `${timestamp} ${level}: ${message}`)
    ),
    transports: [
        new transports.Console({format: format.combine(format.colorize(), format.simple())})
    ]
});

export function setLogFile(filename: string) {
    logFilePath = `logs/${filename}.log`;
    logger.clear();
    logger.add(new transports.File({filename: logFilePath}));
    logger.add(new transports.Console({format: combine(colorize(), simple())}));
}

export const getLogFilePath = () => logFilePath;

export default logger;

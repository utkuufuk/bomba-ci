import {createLogger, format, transports} from 'winston';
const {combine, timestamp, printf} = format;

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
        new transports.File({filename: 'logs/quick-start-combined.log'}),
        new transports.Console({format: format.combine(format.colorize(), format.simple())})
    ]
});

export default logger;

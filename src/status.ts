import timestamp from './timestamp';

export enum State {
    ERROR = 'error',
    FAILURE = 'failure',
    PENDING = 'pending',
    SUCCESS = 'success'
}

const stateDescription = {
    [State.ERROR]: 'could not be started',
    [State.FAILURE]: 'failed',
    [State.PENDING]: 'queued',
    [State.SUCCESS]: 'successful'
};

const getDescription = (context: string, state: State) =>
    `${timestamp()} — ${context} task ${stateDescription[state]}`;

export default {
    getDescription
};

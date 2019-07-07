export default () =>
    new Date()
        .toISOString()
        .substring(0, 19)
        .replace('T', '@');

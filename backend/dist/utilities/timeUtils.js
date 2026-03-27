export const getTimeCutoff = (cutoffPeriod) => {
    return new Date(Date.now() - cutoffPeriod * 1000);
};

export const getTimeCutoff = (cutoffPeriod: number) => {
  return new Date(Date.now() - cutoffPeriod * 1000);
};

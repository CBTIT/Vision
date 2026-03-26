import RevitSession from "../models/RevitSession.js";

export const getSesisonsCount = async () => {
  const count = await RevitSession.countDocuments({});
  return count;
};
export const getSessions = async () => {
  const session = await RevitSession.find({});
  return session;
};

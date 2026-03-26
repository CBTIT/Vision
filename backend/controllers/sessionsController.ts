import { Request, Response } from "express";
import { getSesisonsCount, getSessions } from "../services/sessionService.js";

export const getAllSessionsCount = async (req: Request, res: Response) => {
  const sessionCount = await getSesisonsCount();
  res.json({ sessionCount: sessionCount });
};
export const getAllSessions = async (req: Request, res: Response) => {
  const sessions = await getSessions();
  res.json({ sessions: sessions });
};

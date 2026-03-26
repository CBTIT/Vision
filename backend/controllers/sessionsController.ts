import { Request, Response } from "express";
import { getSesisonsCount, getSessions } from "../services/sessionService.js";

export const getSessionsCountController = async (
  req: Request,
  res: Response,
) => {
  const filters = {
    from: (req.query.from as string) || undefined,
    to: (req.query.to as string) || undefined,
  };
  const sessionCount = await getSesisonsCount(filters);
  res.json({ sessionCount: sessionCount });
};
export const getSessionsController = async (req: Request, res: Response) => {
  try {
    const filters = {
      limit: Number(req.query.limit) || undefined,
      from: (req.query.from as string) || undefined,
      to: (req.query.to as string) || undefined,
    };
    const sessions = await getSessions(filters);
    res.json({ sessions: sessions });
  } catch (err) {
    console.error("Error getting sessions:", err);
    res.status(500).json({ error: "Failed to get sessions" });
  }
};

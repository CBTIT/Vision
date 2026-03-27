import { Request, Response } from "express";
import {
  getSesisonsCount,
  getSessionById,
  getSessions,
} from "../services/sessionService.js";

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
      page: Number(req.query.page) || undefined,
      from: (req.query.from as string) || undefined,
      to: (req.query.to as string) || undefined,
      autodeskUserName: (req.query.autodeskUserName as string) || undefined,
      modelId: (req.query.modelId as string) || undefined,
      deviceName: (req.query.deviceName as string) || undefined,
    };
    const sessions = await getSessions(filters);
    res.json(sessions);
  } catch (err) {
    console.error("Error getting sessions:", err);
    res.status(500).json({ error: "Failed to get sessions" });
  }
};

export const getSessionByIdController = async (req: Request, res: Response) => {
  try {
    const sessionIdParam = req.params.id;
    const sessionId = Array.isArray(sessionIdParam)
      ? sessionIdParam[0]
      : sessionIdParam;

    if (!sessionId) {
      return res.status(400).json({ error: "Session id is required" });
    }

    const session = await getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    return res.json(session);
  } catch (err) {
    console.error("Error getting session by id:", err);
    return res.status(500).json({ error: "Failed to get session" });
  }
};

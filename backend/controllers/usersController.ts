import { Request, Response } from "express";
import { getUsersSummary } from "../services/usersService.js";

export const getUsersSummaryController = async (
  _req: Request,
  res: Response,
) => {
  try {
    const items = await getUsersSummary();
    return res.json({ items, total: items.length });
  } catch (err) {
    console.error("Error getting users summary:", err);
    return res.status(500).json({ error: "Failed to get users summary" });
  }
};

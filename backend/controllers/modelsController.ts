import { Request, Response } from "express";
import { getModelsSummary } from "../services/modelsService.js";

export const listModels = async (req: Request, res: Response) => {
  try {
    const from =
      typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const items = await getModelsSummary(from, to);
    res.json({ items, total: items.length });
  } catch (err) {
    console.error("listModels error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

import { Request, Response } from "express";
import {
  getModelsSummary,
  getModelSizeHistory,
  getModelWarningsData,
  getModelWarningsTimeSeries,
} from "../services/modelsService.js";

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

export const getModelHistory = async (req: Request, res: Response) => {
  try {
    const modelId =
      typeof req.params.modelId === "string" ? req.params.modelId : "";
    const from =
      typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const points = await getModelSizeHistory(modelId, from, to);
    res.json({ modelId, points });
  } catch (err) {
    console.error("getModelHistory error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getModelWarningsOverview = async (
  req: Request,
  res: Response,
) => {
  try {
    const from =
      typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const data = await getModelWarningsData(from, to);
    res.json(data);
  } catch (err) {
    console.error("getModelWarningsOverview error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getModelWarningsHistory = async (
  req: Request,
  res: Response,
) => {
  try {
    const modelId =
      typeof req.params.modelId === "string" ? req.params.modelId : "";
    const from =
      typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const points = await getModelWarningsTimeSeries(modelId, from, to);
    res.json({ modelId, points });
  } catch (err) {
    console.error("getModelWarningsHistory error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

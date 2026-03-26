import { Request, Response } from "express";
import {
  getPluginUseCount,
  getPluginUseList,
} from "../services/pluginService.js";

export const getPluginUseCountController = async (
  _req: Request,
  res: Response,
) => {
  try {
    const pluginUseCount = await getPluginUseCount();
    return res.json({ pluginUseCount });
  } catch (err) {
    console.error("Error getting plugin use count:", err);
    return res.status(500).json({ error: "Failed to get plugin use count" });
  }
};

export const getPluginUseListController = async (
  req: Request,
  res: Response,
) => {
  try {
    const filters = {
      limit: Number(req.query.limit) || undefined,
      page: Number(req.query.page) || undefined,
    };

    const pluginUseList = await getPluginUseList(filters);
    return res.json(pluginUseList);
  } catch (err) {
    console.error("Error getting plugin use list:", err);
    return res.status(500).json({ error: "Failed to get plugin use list" });
  }
};

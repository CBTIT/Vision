import { getModelsSummary, getModelSizeHistory, } from "../services/modelsService.js";
export const listModels = async (req, res) => {
    try {
        const from = typeof req.query.from === "string" ? req.query.from : undefined;
        const to = typeof req.query.to === "string" ? req.query.to : undefined;
        const items = await getModelsSummary(from, to);
        res.json({ items, total: items.length });
    }
    catch (err) {
        console.error("listModels error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};
export const getModelHistory = async (req, res) => {
    try {
        const modelId = typeof req.params.modelId === "string" ? req.params.modelId : "";
        const from = typeof req.query.from === "string" ? req.query.from : undefined;
        const to = typeof req.query.to === "string" ? req.query.to : undefined;
        const points = await getModelSizeHistory(modelId, from, to);
        res.json({ modelId, points });
    }
    catch (err) {
        console.error("getModelHistory error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

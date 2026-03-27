import { getOverviewDailyCounts, getOverviewDateBounds, } from "../services/overviewService.js";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const getTodayLocalYmd = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};
const isValidYmdDate = (value) => {
    if (!DATE_RE.test(value))
        return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day);
};
const getSingleQueryValue = (value) => {
    if (value === undefined)
        return { ok: true, value: undefined };
    if (typeof value === "string")
        return { ok: true, value };
    return { ok: false, message: "Query params must be single string values." };
};
export const getOverviewDailyCountsController = async (req, res) => {
    const fromParam = getSingleQueryValue(req.query.from);
    if (!fromParam.ok) {
        return res.status(400).json({ error: fromParam.message });
    }
    const toParam = getSingleQueryValue(req.query.to);
    if (!toParam.ok) {
        return res.status(400).json({ error: toParam.message });
    }
    const today = getTodayLocalYmd();
    const from = fromParam.value ?? today;
    const to = toParam.value ?? today;
    if (!isValidYmdDate(from)) {
        return res.status(400).json({
            error: "Invalid 'from' date format. Expected YYYY-MM-DD.",
        });
    }
    if (!isValidYmdDate(to)) {
        return res.status(400).json({
            error: "Invalid 'to' date format. Expected YYYY-MM-DD.",
        });
    }
    if (from > to) {
        return res.status(400).json({
            error: "'from' must be less than or equal to 'to'.",
        });
    }
    try {
        const result = await getOverviewDailyCounts(from, to);
        return res.json(result);
    }
    catch (err) {
        console.error("Error getting overview daily counts:", err);
        return res
            .status(500)
            .json({ error: "Failed to get overview daily counts." });
    }
};
export const getOverviewDateBoundsController = async (_req, res) => {
    try {
        const bounds = await getOverviewDateBounds();
        return res.json(bounds);
    }
    catch (err) {
        console.error("Error getting overview date bounds:", err);
        return res
            .status(500)
            .json({ error: "Failed to get overview date bounds." });
    }
};

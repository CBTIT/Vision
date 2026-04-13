import { getSesisonsCount, getSessionById, getSessionFilterOptions, getSessions, } from "../services/sessionService.js";
export const getSessionsCountController = async (req, res) => {
    const filters = {
        from: req.query.from || undefined,
        to: req.query.to || undefined,
    };
    const sessionCount = await getSesisonsCount(filters);
    res.json({ sessionCount: sessionCount });
};
export const getSessionsController = async (req, res) => {
    try {
        const crashRaw = req.query.crashOnly ?? req.query.crash;
        const crashStr = Array.isArray(crashRaw)
            ? String(crashRaw[0] ?? "")
            : String(crashRaw ?? "");
        const crashOnly = crashStr === "true" || crashStr === "1" || crashStr === "yes";
        const filters = {
            limit: Number(req.query.limit) || undefined,
            page: Number(req.query.page) || undefined,
            from: req.query.from || undefined,
            to: req.query.to || undefined,
            autodeskUserName: req.query.autodeskUserName || undefined,
            modelId: req.query.modelId || undefined,
            deviceName: req.query.deviceName || undefined,
            cloudProjectName: req.query.cloudProjectName || undefined,
            crashOnly: crashOnly || undefined,
        };
        const sessions = await getSessions(filters);
        res.json(sessions);
    }
    catch (err) {
        console.error("Error getting sessions:", err);
        res.status(500).json({ error: "Failed to get sessions" });
    }
};
export const getSessionFilterOptionsController = async (req, res) => {
    try {
        const from = req.query.from || undefined;
        const to = req.query.to || undefined;
        const cloudProjectName = req.query.cloudProjectName || undefined;
        const modelId = req.query.modelId || undefined;
        const options = await getSessionFilterOptions({
            from,
            to,
            cloudProjectName,
            modelId,
        });
        res.json(options);
    }
    catch (err) {
        console.error("Error getting session filter options:", err);
        res.status(500).json({ error: "Failed to get session filter options" });
    }
};
export const getSessionByIdController = async (req, res) => {
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
    }
    catch (err) {
        console.error("Error getting session by id:", err);
        return res.status(500).json({ error: "Failed to get session" });
    }
};

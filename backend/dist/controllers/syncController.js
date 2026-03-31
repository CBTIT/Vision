import { getSyncById, getSyncsCount, getSyncs } from "../services/syncService.js";
export const getSyncsCountController = async (req, res) => {
    try {
        const filters = {
            from: req.query.from || undefined,
            to: req.query.to || undefined,
        };
        const syncsCount = await getSyncsCount(filters);
        return res.json({ syncsCount: syncsCount });
    }
    catch (err) {
        console.error("Error getting sync counts:", err);
        res.status(500).json({ error: "Error getting sync counts" });
    }
};
export const getSyncsController = async (req, res) => {
    try {
        const filters = {
            limit: Number(req.query.limit) || undefined,
            page: Number(req.query.page) || undefined,
            from: req.query.from || undefined,
            to: req.query.to || undefined,
            autodeskUserName: req.query.autodeskUserName || undefined,
        };
        const syncs = await getSyncs(filters);
        res.json(syncs);
    }
    catch (err) {
        console.error("Error getting syncs:", err);
        res.status(500).json({ error: "Error getting syncs" });
    }
};
export const getSyncByIdController = async (req, res) => {
    try {
        const syncId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const sync = await getSyncById(syncId);
        res.json(sync);
    }
    catch (err) {
        console.error("Error getting sync by id:", err);
        res.status(404).json({ error: "Sync not found" });
    }
};

import { getCloudProjectDetails, getCloudProjectsByCategory, } from "../services/cloudService.js";
export const listCloudProjectsController = async (_req, res) => {
    try {
        const data = await getCloudProjectsByCategory();
        return res.json(data);
    }
    catch (err) {
        console.error("listCloudProjectsController error:", err);
        return res.status(500).json({ error: "Failed to load cloud projects" });
    }
};
export const getCloudProjectDetailsController = async (req, res) => {
    try {
        const hubParam = req.params.hubId;
        const projectParam = req.params.projectId;
        const hubId = decodeURIComponent(Array.isArray(hubParam) ? hubParam[0] || "" : hubParam || "").trim();
        const projectId = decodeURIComponent(Array.isArray(projectParam)
            ? projectParam[0] || ""
            : projectParam || "").trim();
        if (!hubId || !projectId) {
            return res
                .status(400)
                .json({ error: "hubId and projectId are required" });
        }
        const details = await getCloudProjectDetails(hubId, projectId);
        return res.json(details);
    }
    catch (err) {
        console.error("getCloudProjectDetailsController error:", err);
        return res
            .status(500)
            .json({ error: "Failed to load cloud project details" });
    }
};

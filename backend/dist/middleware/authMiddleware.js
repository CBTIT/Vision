import jwt from "jsonwebtoken";
export const authMiddleware = (req, res, next) => {
    try {
        const token = req.cookies.authToken;
        if (!token) {
            return res.status(401).json({ error: "No token provided" });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (typeof decoded === "object") {
            req.userId = decoded.userId;
            req.email = decoded.email;
            req.fullName =
                typeof decoded.fullName === "string" ? decoded.fullName : undefined;
            req.profileIcon =
                typeof decoded.profileIcon === "string" ? decoded.profileIcon : undefined;
        }
        next();
    }
    catch (err) {
        console.error("Auth middleware error:", err);
        return res.status(401).json({ error: "Invalid token" });
    }
};

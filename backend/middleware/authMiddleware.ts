import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: string;
  email?: string;
  fullName?: string;
  profileIcon?: string;
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.cookies.authToken;

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    if (typeof decoded === "object") {
      req.userId = decoded.userId;
      req.email = decoded.email;
      req.fullName =
        typeof decoded.fullName === "string" ? decoded.fullName : undefined;
      req.profileIcon =
        typeof decoded.profileIcon === "string" ? decoded.profileIcon : undefined;
    }
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
};

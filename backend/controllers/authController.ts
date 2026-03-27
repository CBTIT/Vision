import { Response } from "express";
import {
  loginService,
  changePasswordService,
  getUserService,
  updateProfileIconService,
} from "../services/authService.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

export const loginController = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const { token, user } = await loginService(email, password);
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("authToken", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "strict",
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    });

    return res.json({ success: true, user });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Login error:", error);
    return res.status(401).json({ error: error.message || "Login failed" });
  }
};

export const logoutController = (req: AuthRequest, res: Response) => {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie("authToken", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "strict",
  });
  return res.json({ success: true, message: "Logged out successfully" });
};

export const changePasswordController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    await changePasswordService(req.userId, currentPassword, newPassword);
    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Change password error:", error);
    return res
      .status(400)
      .json({ error: error.message || "Failed to change password" });
  }
};

export const getMeController = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await getUserService(req.userId);
    return res.json(user);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Get user error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to get user" });
  }
};

export const updateProfileIconController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { profileIcon } = req.body;

    if (!profileIcon) {
      return res.status(400).json({ error: "Profile icon is required" });
    }

    await updateProfileIconService(req.userId, profileIcon);
    const user = await getUserService(req.userId);
    return res.json({ success: true, user });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Update profile icon error:", error);
    return res
      .status(400)
      .json({ error: error.message || "Failed to update profile icon" });
  }
};

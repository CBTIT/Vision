import { loginService, changePasswordService, getUserService, updateProfileIconService, } from "../services/authService.js";
export const loginController = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }
        const { token, user } = await loginService(email, password);
        res.cookie("authToken", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        });
        return res.json({ success: true, user });
    }
    catch (err) {
        const error = err;
        console.error("Login error:", error);
        return res.status(401).json({ error: error.message || "Login failed" });
    }
};
export const logoutController = (req, res) => {
    res.clearCookie("authToken");
    return res.json({ success: true, message: "Logged out successfully" });
};
export const changePasswordController = async (req, res) => {
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
    }
    catch (err) {
        const error = err;
        console.error("Change password error:", error);
        return res
            .status(400)
            .json({ error: error.message || "Failed to change password" });
    }
};
export const getMeController = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        const user = await getUserService(req.userId);
        return res.json(user);
    }
    catch (err) {
        const error = err;
        console.error("Get user error:", error);
        return res
            .status(500)
            .json({ error: error.message || "Failed to get user" });
    }
};
export const updateProfileIconController = async (req, res) => {
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
    }
    catch (err) {
        const error = err;
        console.error("Update profile icon error:", error);
        return res
            .status(400)
            .json({ error: error.message || "Failed to update profile icon" });
    }
};

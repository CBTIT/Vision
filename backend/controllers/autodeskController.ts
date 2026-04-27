import { Request, Response } from "express";
import {
  disconnect,
  generateAuthUrl,
  getAccessToken,
  handleCallback,
  isConnected,
} from "../services/autodeskAuthService.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const GRAPHQL_URL = "https://developer.api.autodesk.com/aec/graphql";

export const getAuthUrlController = (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const url = generateAuthUrl(userId);
  res.json({ url });
};

export const oauthCallbackController = async (
  req: Request,
  res: Response,
) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  if (error || !code || !state) {
    return res.redirect(`${FRONTEND_URL}/model-explorer?error=auth_cancelled`);
  }

  try {
    const redirectUrl = await handleCallback(code, state);
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("Autodesk OAuth callback error:", err);
    res.redirect(`${FRONTEND_URL}/model-explorer?error=auth_failed`);
  }
};

export const getStatusController = (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  res.json({ connected: isConnected(userId) });
};

export const graphqlProxyController = async (
  req: AuthRequest,
  res: Response,
) => {
  const userId = req.userId!;
  const token = await getAccessToken(userId);

  if (!token) {
    return res.status(401).json({ error: "Not connected to Autodesk. Please authenticate first." });
  }

  try {
    const upstream = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Autodesk GraphQL proxy error:", err);
    res.status(500).json({ error: "GraphQL request failed" });
  }
};

export const disconnectController = (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  disconnect(userId);
  res.json({ success: true });
};

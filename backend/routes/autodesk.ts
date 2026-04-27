import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  disconnectController,
  getAuthUrlController,
  getStatusController,
  graphqlProxyController,
  oauthCallbackController,
} from "../controllers/autodeskController.js";

const router = Router();

// Initiates OAuth — requires the user to be logged into the app
router.get("/auth-url", authMiddleware, getAuthUrlController);

// Autodesk redirects here after user authorizes — no app auth needed
router.get("/callback", oauthCallbackController);

// Check whether the current user has a valid Autodesk token
router.get("/status", authMiddleware, getStatusController);

// Proxy GraphQL requests to the AEC Data Model API
router.post("/graphql", authMiddleware, graphqlProxyController);

// Remove the stored Autodesk token for the current user
router.delete("/disconnect", authMiddleware, disconnectController);

export default router;

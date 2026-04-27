import { randomUUID } from "crypto";

const CLIENT_ID = process.env.ACC_CLIENT_ID!;
const CLIENT_SECRET = process.env.ACC_CLIENT_SECRET!;
const REDIRECT_URI =
  process.env.AUTODESK_CALLBACK_URL ||
  "http://localhost:3000/api/autodesk/callback";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Temporary state -> userId map (cleared after use or 10 min)
const pendingStates = new Map<string, string>();

type TokenData = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

// userId -> Autodesk token
const userTokens = new Map<string, TokenData>();

export function generateAuthUrl(userId: string): string {
  const state = randomUUID();
  pendingStates.set(state, userId);
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "data:read account:read",
    state,
  });
  return `https://developer.api.autodesk.com/authentication/v2/authorize?${params}`;
}

async function exchangeToken(body: URLSearchParams): Promise<TokenData> {
  const res = await fetch(
    "https://developer.api.autodesk.com/authentication/v2/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      },
      body: body.toString(),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  };
}

export async function handleCallback(
  code: string,
  state: string,
): Promise<string> {
  const userId = pendingStates.get(state);
  if (!userId) throw new Error("Invalid or expired OAuth state");
  pendingStates.delete(state);

  const tokenData = await exchangeToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  );

  userTokens.set(userId, tokenData);
  return `${FRONTEND_URL}/model-explorer?connected=true`;
}

export async function getAccessToken(userId: string): Promise<string | null> {
  const token = userTokens.get(userId);
  if (!token) return null;

  if (Date.now() < token.expiresAt) return token.accessToken;

  try {
    const refreshed = await exchangeToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    );
    userTokens.set(userId, refreshed);
    return refreshed.accessToken;
  } catch {
    userTokens.delete(userId);
    return null;
  }
}

export function isConnected(userId: string): boolean {
  return userTokens.has(userId);
}

export function disconnect(userId: string): void {
  userTokens.delete(userId);
}

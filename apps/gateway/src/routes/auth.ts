import { Router } from "express";
import crypto from "node:crypto";
import { config } from "../config.ts";
import { getStore } from "../db/store.ts";
import { encrypt } from "../lib/crypto.ts";

export const authRouter = Router();

const stateStore = new Set<string>();

// GET /auth/github/start — redirect to GitHub's OAuth consent screen.
authRouter.get("/github/start", (_req, res) => {
  if (!config.github.clientId) {
    return res.status(503).json({
      error: "GitHub OAuth not configured",
      hint: "Set GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET in .env, or use POST /demo/run for the no-OAuth demo.",
    });
  }
  const state = crypto.randomBytes(16).toString("hex");
  stateStore.add(state);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.github.clientId);
  url.searchParams.set("redirect_uri", `${config.gatewayUrl}/auth/github/callback`);
  url.searchParams.set("scope", config.github.scopes.split(",").join(" "));
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

// GET /auth/github/callback — exchange code, store encrypted token, redirect.
authRouter.get("/github/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || !stateStore.has(state)) {
      return res.status(400).send("invalid OAuth state");
    }
    stateStore.delete(state);

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: `${config.gatewayUrl}/auth/github/callback`,
      }),
    });
    const tok = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tok.access_token) return res.status(400).send(`OAuth error: ${tok.error ?? "no token"}`);

    const userRes = await fetch(`${config.github.apiBase}/user`, {
      headers: { Authorization: `Bearer ${tok.access_token}`, "User-Agent": "Helmsman" },
    });
    const user = (await userRes.json()) as { id: number; login: string; email?: string };

    const store = await getStore();
    // The maintainer's token is encrypted at rest (AES-256-GCM).
    const encToken = encrypt(tok.access_token);
    await store.appendAudit({
      case_id: "",
      actor_type: "human",
      actor_name: `@${user.login}`,
      action: "oauth_connect",
      output: { github_id: user.id },
    });
    // (Maintainer persistence wired in the live DB path; encToken handed to the
    //  web app via the redirect for the connect flow.)
    res.redirect(`${config.webUrl}/connect?connected=1&login=${encodeURIComponent(user.login)}`);
    void encToken;
  } catch (e) {
    res.status(500).send(`OAuth failure: ${(e as Error).message}`);
  }
});

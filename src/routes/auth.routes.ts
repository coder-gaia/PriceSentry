import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { requireAuth, type AuthedRequest } from "../middleware/auth.middleware";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function signAccessToken(userId: string) {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

function signRefreshToken(userId: string) {
  return jwt.sign({ sub: userId, type: "refresh" }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

function setRefreshCookie(res: import("express").Response, refreshToken: string) {
  console.log(`[auth-debug] setting refresh cookie: sameSite=${env.cookieCrossSite ? "none" : "lax"}, secure=${env.cookieCrossSite}, COOKIE_CROSS_SITE env raw value = "${process.env.COOKIE_CROSS_SITE}"`);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: env.cookieCrossSite ? "none" : "lax",
    secure: env.cookieCrossSite,
    path: "/auth",
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: import("express").Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: env.cookieCrossSite ? "none" : "lax",
    secure: env.cookieCrossSite,
    path: "/auth",
  });
}

async function issueSession(res: import("express").Response, user: { id: string; email: string }) {
  const token = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id);
  setRefreshCookie(res, refreshToken);
  return { token, user: { id: user.id, email: user.email } };
}

authRouter.post("/register", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, passwordHash } });

  res.status(201).json(await issueSession(res, user));
});

authRouter.post("/login", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  res.json(await issueSession(res, user));
});

authRouter.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!refreshToken) return res.status(401).json({ error: "No refresh token" });

  try {
    const payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as { sub: string; type: string };
    if (payload.type !== "refresh") throw new Error("Wrong token type");

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "User not found" });

    res.json(await issueSession(res, user));
  } catch {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth" });
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth" });
  res.status(204).send();
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } });
  res.json({ id: user.id, email: user.email, webhookUrl: user.webhookUrl, webhookType: user.webhookType });
});

const webhookSchema = z
  .object({
    webhookUrl: z.string().url().nullable(),
    webhookType: z.enum(["slack", "discord"]).nullable(),
  })
  .refine((data) => (data.webhookUrl === null) === (data.webhookType === null), {
    message: "webhookUrl and webhookType must be set or cleared together",
  });

authRouter.patch("/webhook", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: { webhookUrl: parsed.data.webhookUrl, webhookType: parsed.data.webhookType },
  });
  res.json({ id: user.id, email: user.email, webhookUrl: user.webhookUrl, webhookType: user.webhookType });
});
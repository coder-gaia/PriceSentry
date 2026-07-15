import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export function requireBasicAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf-8");
    const [user, password] = decoded.split(":");
    if (user === env.bullBoardUser && password === env.bullBoardPassword) {
      return next();
    }
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="PriceSentry Admin"');
  res.status(401).send("Authentication required");
}
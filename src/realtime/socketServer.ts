import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { createRedisConnection } from "../lib/redis";
import { createAdapter } from "@socket.io/redis-adapter";

type SocketAuthPayload = { sub: string };

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function setupSocketServer(httpServer: HttpServer): Server {
  const pubClient = createRedisConnection();
  const subClient = pubClient.duplicate();

  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
    adapter: createAdapter(pubClient, subClient),
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") return next(new Error("Missing auth token"));
    try {
      const payload = jwt.verify(token, env.jwtSecret) as SocketAuthPayload;
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.data.userId));
  });

  return io;
}
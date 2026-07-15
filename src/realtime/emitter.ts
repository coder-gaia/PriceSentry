import { Emitter } from "@socket.io/redis-emitter";
import { createRedisConnection } from "../lib/redis";
import { userRoom } from "./socketServer";

const emitter = new Emitter(createRedisConnection());

export function emitSentinelUpdated(userId: string, trackedProductId: string): void {
  emitter.to(userRoom(userId)).emit("sentinel:updated", { trackedProductId });
}
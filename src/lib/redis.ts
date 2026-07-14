import IORedis from "ioredis";
import { env } from "../config/env";

export function createRedisConnection() {
  return new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
  });
}

import IORedis from "ioredis";

const MIN_GAP_MS = 2_000;

export async function tryClaimDomainSlot(redis: IORedis, domain: string): Promise<boolean> {
  const key = `throttle:domain:${domain}`;
  const result = await redis.set(key, "1", "PX", MIN_GAP_MS, "NX");
  return result === "OK";
}

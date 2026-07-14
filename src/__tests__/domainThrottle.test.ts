import { describe, it, expect, afterAll } from "vitest";
import { createRedisConnection } from "../lib/redis";
import { tryClaimDomainSlot } from "../lib/domainThrottle";

describe("tryClaimDomainSlot", () => {
  const redis = createRedisConnection();
  const domain = `test-domain-${Date.now()}.example.com`;

  afterAll(() => {
    redis.disconnect();
  });

  it("allows the first claim and blocks an immediate second claim", async () => {
    const first = await tryClaimDomainSlot(redis, domain);
    const second = await tryClaimDomainSlot(redis, domain);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("allows a new claim once the throttle window expires", async () => {
    const domain2 = `${domain}-window`;
    const first = await tryClaimDomainSlot(redis, domain2);
    expect(first).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    const second = await tryClaimDomainSlot(redis, domain2);
    expect(second).toBe(true);
  }, 5_000);
});

import { Worker } from "bullmq";
import { createRedisConnection } from "../lib/redis";
import { QUEUE_NAMES, priceCheckQueue, type PriceCheckJobData } from "./queues";
import { runPriceCheck } from "../services/priceCheck.service";
import { prisma } from "../lib/prisma";
import { tryClaimDomainSlot } from "../lib/domainThrottle";

export function startPriceCheckWorker(): Worker {
  const connection = createRedisConnection();

  return new Worker<PriceCheckJobData>(
    QUEUE_NAMES.priceCheck,
    async (job) => {
      const product = await prisma.trackedProduct.findUnique({
        where: { id: job.data.trackedProductId },
      });
      if (!product) return { skipped: true, reason: "product-not-found" };

      const slotClaimed = await tryClaimDomainSlot(connection, product.domain);
      if (!slotClaimed) {
        await priceCheckQueue.add(
          "check",
          job.data,
          { delay: 500, jobId: `${job.id}-retry-${Date.now()}` },
        );
        return { skipped: true, reason: "domain-throttled" };
      }

      await runPriceCheck(job.data.trackedProductId);
      return { skipped: false };
    },
    {
      connection,
      limiter: { max: 5, duration: 1_000 },
    },
  );
}

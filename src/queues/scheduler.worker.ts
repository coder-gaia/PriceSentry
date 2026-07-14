import { Worker } from "bullmq";
import type { TrackedProduct } from "@prisma/client";
import { createRedisConnection } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { priceCheckQueue, QUEUE_NAMES, schedulerQueue } from "./queues";
import { env } from "../config/env";

const SCHEDULER_REPEAT_JOB_ID = "fan-out-due-products";

export async function ensureSchedulerRegistered(): Promise<void> {
  const existing = await schedulerQueue.getRepeatableJobs();
  const alreadyRegistered = existing.some((job) => job.id === SCHEDULER_REPEAT_JOB_ID);
  if (alreadyRegistered) return;

  await schedulerQueue.add(
    "fan-out",
    {},
    {
      jobId: SCHEDULER_REPEAT_JOB_ID,
      repeat: { every: env.schedulerIntervalMs },
    },
  );
}

async function fanOutDueProducts(): Promise<number> {
  const active = await prisma.trackedProduct.findMany({ where: { isActive: true } });
  const now = Date.now();

  const due = active.filter((product: TrackedProduct) => {
    if (!product.lastCheckedAt) return true;
    const elapsedMs = now - product.lastCheckedAt.getTime();
    return elapsedMs >= product.checkIntervalMinutes * 60_000;
  });

  await Promise.all(
    due.map((product: TrackedProduct) =>
      priceCheckQueue.add(
        "check",
        { trackedProductId: product.id },
        { jobId: `check-${product.id}` },
      ),
    ),
  );

  return due.length;
}

export function startSchedulerWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.scheduler,
    async () => {
      const count = await fanOutDueProducts();
      return { enqueued: count };
    },
    { connection: createRedisConnection() },
  );
}

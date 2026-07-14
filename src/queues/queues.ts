import { Queue } from "bullmq";
import { createRedisConnection } from "../lib/redis";

export const QUEUE_NAMES = {
  scheduler: "scheduler",
  priceCheck: "price-check",
  notify: "notify",
} as const;

const connection = createRedisConnection();

export const schedulerQueue = new Queue(QUEUE_NAMES.scheduler, { connection });

export const priceCheckQueue = new Queue(QUEUE_NAMES.priceCheck, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86_400 },
  },
});

export const notifyQueue = new Queue(QUEUE_NAMES.notify, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86_400 },
  },
});

export type PriceCheckJobData = {
  trackedProductId: string;
};

export type NotifyJobData = {
  userId: string;
  trackedProductId: string;
  priceCents: number;
  notificationId: string;
};

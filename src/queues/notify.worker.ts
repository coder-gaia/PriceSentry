import { Worker } from "bullmq";
import { createRedisConnection } from "../lib/redis";
import { QUEUE_NAMES, type NotifyJobData } from "./queues";
import { sendPriceDropNotifications } from "../services/notification.service";

export function startNotifyWorker(): Worker {
  return new Worker<NotifyJobData>(
    QUEUE_NAMES.notify,
    async (job) => {
      await sendPriceDropNotifications({
        notificationId: job.data.notificationId,
        userId: job.data.userId,
        trackedProductId: job.data.trackedProductId,
        priceCents: job.data.priceCents,
  });
    },
    { connection: createRedisConnection() },
  );
}

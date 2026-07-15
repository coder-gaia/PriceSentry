import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { schedulerQueue, priceCheckQueue, notifyQueue } from "./queues";

export function createBullBoardRouter(basePath: string) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);

  createBullBoard({
    queues: [
      new BullMQAdapter(schedulerQueue),
      new BullMQAdapter(priceCheckQueue),
      new BullMQAdapter(notifyQueue),
    ],
    serverAdapter,
  });

  return serverAdapter.getRouter();
}
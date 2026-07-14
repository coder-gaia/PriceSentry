import { ensureSchedulerRegistered, startSchedulerWorker } from "./queues/scheduler.worker";
import { startPriceCheckWorker } from "./queues/priceCheck.worker";
import { startNotifyWorker } from "./queues/notify.worker";

async function main() {
  await ensureSchedulerRegistered();

  const scheduler = startSchedulerWorker();
  const priceCheck = startPriceCheckWorker();
  const notify = startNotifyWorker();

  for (const worker of [scheduler, priceCheck, notify]) {
    worker.on("failed", (job, err) => {
      console.error(`[${worker.name}] job ${job?.id} failed:`, err.message);
    });
  }

  console.log("Workers running: scheduler, price-check, notify");
}

main().catch((error) => {
  console.error("Fatal error starting workers:", error);
  process.exit(1);
});

import { ensureSchedulerRegistered, startSchedulerWorker } from "./scheduler.worker";
import { startPriceCheckWorker } from "./priceCheck.worker";
import { startNotifyWorker } from "./notify.worker";

export async function startAllWorkers(): Promise<void> {
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
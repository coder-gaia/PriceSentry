import { describe, it, expect, afterAll } from "vitest";
import { Queue, Worker } from "bullmq";
import { createRedisConnection } from "../lib/redis";

describe("BullMQ roundtrip against a live Redis instance", () => {
  const testQueueName = `test-queue-${Date.now()}`;
  const connection = createRedisConnection();
  const queue = new Queue(testQueueName, { connection });

  afterAll(async () => {
    await queue.close();
    connection.disconnect();
  });

  it("processes a job end-to-end and returns the worker's result", async () => {
    const worker = new Worker(
      testQueueName,
      async (job) => ({ doubled: job.data.value * 2 }),
      { connection: createRedisConnection() },
    );

    const job = await queue.add("double", { value: 21 });

    const result = await new Promise((resolve, reject) => {
      worker.on("completed", (completedJob, returnValue) => {
        if (completedJob.id === job.id) resolve(returnValue);
      });
      worker.on("failed", (_job, err) => reject(err));
      setTimeout(() => reject(new Error("timeout waiting for job completion")), 5000);
    });

    expect(result).toEqual({ doubled: 42 });
    await worker.close();
  });

  it("retries with backoff and eventually fails after max attempts", async () => {
    let attempts = 0;
    const worker = new Worker(
      testQueueName,
      async () => {
        attempts += 1;
        throw new Error("simulated transient failure");
      },
      { connection: createRedisConnection() },
    );

    await queue.add(
      "will-fail",
      {},
      { attempts: 3, backoff: { type: "fixed", delay: 50 } },
    );

    await new Promise((resolve) => {
      worker.on("failed", (job) => {
        if (job?.attemptsMade === 3) resolve(undefined);
      });
    });

    expect(attempts).toBe(3);
    await worker.close();
  }, 10_000);
});

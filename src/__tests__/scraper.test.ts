import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import { mockStoreRouter } from "../routes/mockStore.routes";
import { genericCssScraper } from "../scrapers/genericCssScraper";

describe("genericCssScraper against the mock store", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use("/mock-store", mockStoreRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("extracts a valid price in cents from the rendered HTML", async () => {
    const result = await genericCssScraper.scrape(
      `${baseUrl}/mock-store/products/demo-1`,
      ".price",
    );
    expect(result.priceCents).toBeGreaterThan(0);
    expect(Number.isInteger(result.priceCents)).toBe(true);
  });

  it("throws a clear error when the selector matches nothing", async () => {
    await expect(
      genericCssScraper.scrape(`${baseUrl}/mock-store/products/demo-1`, ".does-not-exist"),
    ).rejects.toThrow(/matched no content/);
  });
});

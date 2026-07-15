import { prisma } from "../lib/prisma";
import { genericCssScraper } from "../scrapers/genericCssScraper";
import { notifyQueue } from "../queues/queues";
import { emitSentinelUpdated } from "../realtime/emitter";

export async function runPriceCheck(trackedProductId: string): Promise<void> {
  const product = await prisma.trackedProduct.findUnique({ where: { id: trackedProductId } });
  if (!product || !product.isActive) return;

  try {
    const { priceCents } = await genericCssScraper.scrape(product.url, product.selector);
    const previousPriceCents = product.currentPriceCents;

    await prisma.$transaction([
      prisma.priceCheck.create({
        data: { trackedProductId, priceCents, success: true },
      }),
      prisma.trackedProduct.update({
        where: { id: trackedProductId },
        data: { currentPriceCents: priceCents, lastCheckedAt: new Date() },
      }),
    ]);

    const crossedThreshold = priceCents <= product.targetPriceCents;
    const wasAboveThresholdBefore = previousPriceCents === null || previousPriceCents > product.targetPriceCents;

    if (crossedThreshold && wasAboveThresholdBefore) {
      const notification = await prisma.notification.create({
        data: {
          userId: product.userId,
          trackedProductId: product.id,
          priceCents,
          status: "pending",
        },
      });

      await notifyQueue.add("price-drop", {
        userId: product.userId,
        trackedProductId: product.id,
        priceCents,
        notificationId: notification.id,
      });
    }

    emitSentinelUpdated(product.userId, product.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scrape error";
    await prisma.$transaction([
      prisma.priceCheck.create({
        data: { trackedProductId, success: false, errorMessage: message },
      }),
      prisma.trackedProduct.update({
        where: { id: trackedProductId },
        data: { lastCheckedAt: new Date() },
      }),
    ]);
    emitSentinelUpdated(product.userId, product.id);
    throw error;
  }
}

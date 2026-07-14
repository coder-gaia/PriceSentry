import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthedRequest } from "../middleware/auth.middleware";
import { priceCheckQueue } from "../queues/queues";

export const productsRouter = Router();
productsRouter.use(requireAuth);

const createProductSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  selector: z.string().min(1),
  targetPriceCents: z.number().int().positive(),
  checkIntervalMinutes: z.number().int().min(5).default(60),
});

productsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { url, name, selector, targetPriceCents, checkIntervalMinutes } = parsed.data;
  const domain = new URL(url).hostname;

  const product = await prisma.trackedProduct.create({
    data: {
      userId: req.userId!,
      url,
      domain,
      name,
      selector,
      targetPriceCents,
      checkIntervalMinutes,
    },
  });

  res.status(201).json(product);
});

productsRouter.get("/", async (req: AuthedRequest, res) => {
  const products = await prisma.trackedProduct.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
  });
  res.json(products);
});

productsRouter.get("/:id/history", async (req: AuthedRequest, res) => {
  const product = await prisma.trackedProduct.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!product) return res.status(404).json({ error: "Not found" });

  const history = await prisma.priceCheck.findMany({
    where: { trackedProductId: product.id },
    orderBy: { checkedAt: "asc" },
  });
  res.json(history);
});

productsRouter.post("/:id/check-now", async (req: AuthedRequest, res) => {
  const product = await prisma.trackedProduct.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!product) return res.status(404).json({ error: "Not found" });

  await priceCheckQueue.add(
    "check",
    { trackedProductId: product.id },
    { jobId: `check-${product.id}-manual-${Date.now()}` },
  );

  res.status(202).json({ enqueued: true });
});

productsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const schema = z.object({
    isActive: z.boolean().optional(),
    targetPriceCents: z.number().int().positive().optional(),
    checkIntervalMinutes: z.number().int().min(5).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const product = await prisma.trackedProduct.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!product) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.trackedProduct.update({
    where: { id: product.id },
    data: parsed.data,
  });
  res.json(updated);
});

productsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const product = await prisma.trackedProduct.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!product) return res.status(404).json({ error: "Not found" });

  await prisma.trackedProduct.delete({ where: { id: product.id } });
  res.status(204).send();
});

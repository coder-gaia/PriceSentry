import { Router } from "express";

const basePrices = new Map<string, number>();
const currentPrices = new Map<string, number>();

function getOrInitPrice(productId: string): number {
  if (!currentPrices.has(productId)) {
    const base = 5_000 + (hashCode(productId) % 20_000);
    basePrices.set(productId, base);
    currentPrices.set(productId, base);
  }
  return currentPrices.get(productId)!;
}

function hashCode(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function drift(productId: string): number {
  const base = basePrices.get(productId)!;
  const current = currentPrices.get(productId)!;
  const roll = Math.random();
  let next = current;
  if (roll < 0.15) {
    next = Math.max(Math.round(base * 0.6), current - Math.round(base * 0.1));
  } else if (roll > 0.9) {
    next = Math.min(Math.round(base * 1.15), current + Math.round(base * 0.05));
  }
  currentPrices.set(productId, next);
  return next;
}

export const mockStoreRouter = Router();

mockStoreRouter.get("/products/:id", (req, res) => {
  const { id } = req.params;
  getOrInitPrice(id);
  const priceCents = drift(id);
  const priceReais = (priceCents / 100).toFixed(2).replace(".", ",");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html>
  <head><title>Produto ${id} - PriceSentry Mock Store</title></head>
  <body>
    <div class="product">
      <h1>Produto de demonstração ${id}</h1>
      <span class="price">R$ ${priceReais}</span>
    </div>
  </body>
</html>`);
});

mockStoreRouter.post("/products/:id/reset", (req, res) => {
  const { id } = req.params;
  basePrices.delete(id);
  currentPrices.delete(id);
  res.json({ reset: true });
});

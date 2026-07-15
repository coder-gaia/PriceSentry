import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { authRouter } from "./routes/auth.routes";
import { productsRouter } from "./routes/products.routes";
import { mockStoreRouter } from "./routes/mockStore.routes";
import { createBullBoardRouter } from "./queues/board";
import { requireBasicAuth } from "./middleware/basicAuth.middleware";

const ADMIN_QUEUES_PATH = "/admin/queues";

const app = express();

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(ADMIN_QUEUES_PATH, requireBasicAuth, createBullBoardRouter(ADMIN_QUEUES_PATH));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/products", productsRouter);
app.use("/mock-store", mockStoreRouter);

app.listen(env.port, () => {
  console.log(`PriceSentry API rodando em http://localhost:${env.port}`);
});

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { authRouter } from "./routes/auth.routes";
import { productsRouter } from "./routes/products.routes";
import { mockStoreRouter } from "./routes/mockStore.routes";
import { createBullBoardRouter } from "./queues/board";
import { requireBasicAuth } from "./middleware/basicAuth.middleware";
import { createServer } from "http";
import { setupSocketServer } from "./realtime/socketServer";
import { startAllWorkers } from "./queues/startAllWorkers";

const ADMIN_QUEUES_PATH = "/admin/queues";

const app = express();

const httpServer = createServer(app);

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(ADMIN_QUEUES_PATH, requireBasicAuth, createBullBoardRouter(ADMIN_QUEUES_PATH));
setupSocketServer(httpServer);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/products", productsRouter);
app.use("/mock-store", mockStoreRouter);


httpServer.listen(env.port, () => {
  console.log(`PriceSentry API rodando em http://localhost:${env.port}`);
});

httpServer.listen(env.port, () => {
  console.log(`PriceSentry API rodando em http://localhost:${env.port}`);

  if (env.runWorkersInProcess) {
    console.log("RUN_WORKERS_IN_PROCESS=true — iniciando workers dentro do processo da API");
    startAllWorkers().catch((error) => {
      console.error("Fatal error starting in-process workers:", error);
    });
  }
});
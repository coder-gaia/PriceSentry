import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { authRouter } from "./routes/auth.routes";
import { productsRouter } from "./routes/products.routes";
import { mockStoreRouter } from "./routes/mockStore.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/products", productsRouter);
app.use("/mock-store", mockStoreRouter);

app.listen(env.port, () => {
  console.log(`PriceSentry API rodando em http://localhost:${env.port}`);
});

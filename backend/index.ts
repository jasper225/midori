import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { PrismaClient } from "@prisma/client";
import authRoutes from "../backend/src/routes/auth.routes.js";

const prisma = new PrismaClient();
const app = express();

app.use(helmet());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/auth", authRoutes);

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(4000, () => console.log("API on :4000"));

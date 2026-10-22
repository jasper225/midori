import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import authRoutes from "../backend/src/routes/auth.routes.js";
import sessionRoutes from "../backend/src/routes/scrollSession.routes.js";
import siteRoutes from "../backend/src/routes/trackedSites.routes.js";
import usageRoutes from "../backend/src/routes/dailyUsage.routes.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/auth", authRoutes);
app.use("/sessions", sessionRoutes);
app.use("/sites", siteRoutes);
app.use("/usage", usageRoutes);

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(4000, () => console.log("Server on localhost:4000"));

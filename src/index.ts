// src/server.ts (or src/app.ts – whatever you’re using as entrypoint)

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import fs from "fs";

import { UPLOAD_DIR } from "./config";
import uploadRouter from "./routes/upload";
import chatRouter from "./routes/chat";
import hrHomeRouter from "./routes/hrHome";
import recordingRoutes from "./routes/recordingRoutes";
import emailRoutes from "./routes/emailRoutes";
import { log } from "./logger";

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ------------------------------------------------------------------
// App bootstrap
// ------------------------------------------------------------------
const app = express();

// Security / infra middleware
app.use(helmet());
app.use(cors());
app.use(morgan("tiny"));

// 🔹 IMPORTANT: increase body size limits for JSON + form data
// Base64 PDFs will inflate ~33%, so size accordingly (20–50MB is typical)
const BODY_LIMIT = "50mb";

app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));

// ------------------------------------------------------------------
// Health check
// ------------------------------------------------------------------
app.get("/healthz", (_req, res) => res.sendStatus(200));

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------
app.use("/api/upload", uploadRouter);
app.use("/api/chat", chatRouter);
app.use("/api/hr", hrHomeRouter);
app.use("/api/recordings", recordingRoutes);
app.use("/api/email", emailRoutes);

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ------------------------------------------------------------------
// Server start
// ------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 5007;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`🚀 Gateway listening on http://${HOST}:${PORT}`);
  log(`Gateway listening on http://${HOST}:${PORT}`);
});

export default app;



// import express from 'express';
// import cors from 'cors';
// import helmet from 'helmet';
// import morgan from 'morgan';
// import fs from 'fs';
// import { UPLOAD_DIR } from './config';    // drop PORT import if unused
// import uploadRouter from './routes/upload';
// import chatRouter   from './routes/chat';
// import hrHomeRouter from './routes/hrHome';
// import recordingRoutes from './routes/recordingRoutes';
// import emailRoutes from './routes/emailRoutes';
// import { log }      from './logger';

// // ensure upload dir
// if (!fs.existsSync(UPLOAD_DIR)) {
//   fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// }

// const app = express();
// app.use(helmet());
// app.use(cors());
// app.use(morgan('tiny'));
// app.use(express.json());

// app.get('/healthz', (_req, res) => res.sendStatus(200));
// app.use('/api/upload', uploadRouter);
// app.use('/api/chat',   chatRouter);
// app.use('/api/hr',     hrHomeRouter);
// app.use("/api/recordings", recordingRoutes);
// app.use("/api/email", emailRoutes);
// app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// // ← use ENV or fall back
// const PORT = Number(process.env.PORT) || 5007;
// const HOST = process.env.HOST || '0.0.0.0';

// app.listen(PORT, HOST, () => {
//   console.log(`🚀 Gateway listening on http://${HOST}:${PORT}`);
// });

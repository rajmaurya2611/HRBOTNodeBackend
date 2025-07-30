import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import { PORT, UPLOAD_DIR } from './config';
import uploadRouter from './routes/upload';
import chatRouter   from './routes/chat';
import { log }      from './logger';

// ensure upload dir
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan('tiny'));
app.use(express.json());

app.get('/healthz', (_req, res) => res.sendStatus(200));
app.use('/api/upload', uploadRouter);
app.use('/api/chat',   chatRouter);
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () =>
  log(`🚀 Gateway listening on http://localhost:${PORT}`)
);

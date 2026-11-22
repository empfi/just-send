import express from 'express';
import fs from 'fs';
import path from 'path';
import { PORT, HOST, CLIENT_DIR } from './config';
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import systemRoutes from './routes/system';
import workspaceRoutes from './routes/workspaces';
import sseService from './services/sseService';
import errorHandler from './middleware/errorHandler';
import requestLogger from './middleware/requestLogger';
import { securityHeaders, sameOriginGuard } from './middleware/security';
import { requireSession, type AuthedRequest } from './middleware/auth';
import { printBanner } from './utils/logger';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', false);

app.use(securityHeaders);
app.use('/api', sameOriginGuard);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestLogger);

const clientIndex = path.join(CLIENT_DIR, 'index.html');
if (fs.existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR));
}

app.get('/api/events', requireSession, (req, res) => {
  const auth = (req as AuthedRequest).auth;
  if (!auth) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseService.addClient(res, auth.workspace.id);
});

app.use('/api', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/workspaces', workspaceRoutes);

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    if (fs.existsSync(clientIndex)) {
      return res.sendFile(clientIndex);
    }
    return res
      .status(503)
      .type('text')
      .send('Client bundle not found. Run "npm run build" (or "npm run dev" for the Vite dev server).');
  }
  next();
});

app.use(errorHandler);

app.listen(PORT, HOST, async () => {
  await printBanner(PORT, HOST);
});

export default app;

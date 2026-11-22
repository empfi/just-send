import type { RequestHandler } from 'express';
import { error as logError, info as logInfo, warn as logWarn } from '../utils/logger';

const SKIPPED_PATHS = new Set(['/api/system/logs', '/api/events']);

const requestLogger: RequestHandler = (req, res, next) => {
  const path = req.originalUrl.split('?')[0];
  if (!path.startsWith('/api') || SKIPPED_PATHS.has(path)) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const status = res.statusCode;
    const message = `${req.method} ${path} ${status}`;
    const detail = `${durationMs.toFixed(0)} ms${req.ip ? ` · ${req.ip}` : ''}`;

    if (status >= 500) logError(message, detail);
    else if (status >= 400) logWarn(message, detail);
    else logInfo(message, detail);
  });

  next();
};

export default requestLogger;

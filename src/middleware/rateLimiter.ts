import type { RequestHandler } from 'express';

interface RateRecord {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateRecord>();

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimits.entries()) {
    if (now > record.resetTime) {
      rateLimits.delete(key);
    }
  }
}, 5 * 60 * 1000);

function createRateLimiter({
  windowMs = 60 * 1000,
  max = 10,
  message = 'Too many attempts, please wait a minute',
}: {
  windowMs?: number;
  max?: number;
  message?: string;
}): RequestHandler {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();

    let record = rateLimits.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimits.set(key, record);
      next();
      return;
    }

    record.count++;
    if (record.count > max) {
      const waitSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.status(429).json({
        success: false,
        error: `${message} (${waitSeconds}s remaining)`,
        retryAfter: waitSeconds,
      });
      return;
    }

    next();
  };
}

export const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 12,
  message: 'Too many authentication attempts',
});

export const strictLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 6,
  message: 'Too many verification attempts',
});

// Public share links are unauthenticated, so every endpoint gets a ceiling.
export const shareReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many requests for this link',
});

export const shareDownloadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many downloads from this link',
});

export const shareCreateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many share links created',
});

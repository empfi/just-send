import express from 'express';
import os from 'os';
import mime from 'mime-types';
import { PORT } from '../config';
import { getNetworkAddresses, getPrimaryLanIp, generateQrDataUrl } from '../services/networkService';
import { getInstanceConfig, getInstanceLogoPath } from '../services/instanceConfigService';
import serverLogService from '../services/serverLogService';
import { requireSession, authed } from '../middleware/auth';
import { getRequestOrigin } from '../utils/requestOrigin';

const router = express.Router();

router.get('/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: getInstanceConfig() });
});

router.get('/logo', (_req, res) => {
  const logo = getInstanceLogoPath();
  if (!logo) {
    res.status(404).type('text').send('No logo configured');
    return;
  }

  res.setHeader('Content-Type', mime.lookup(logo) || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(logo);
});

router.get('/logs', requireSession, (req, res) => {
  const auth = authed(req);
  if (!auth.device.isMaster) {
    res.status(403).json({ success: false, error: 'Only master devices can view server logs.' });
    return;
  }

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(500, Math.max(1, Math.floor(rawLimit)))
    : 200;

  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: serverLogService.readRecent(limit) });
});

router.get('/info', async (req, res) => {
  try {
    const addresses = getNetworkAddresses();
    const primaryIp = getPrimaryLanIp();
    const primaryUrl = getRequestOrigin(req);
    const qrDataUrl = await generateQrDataUrl(primaryUrl);

    res.json({
      success: true,
      data: {
        hostname: os.hostname(),
        platform: os.platform(),
        uptime: os.uptime(),
        port: PORT,
        primaryIp,
        primaryUrl,
        addresses: addresses.map((a) => ({
          ...a,
          url: `http://${a.address}:${PORT}`,
        })),
        qrCode: qrDataUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;

import express from 'express';
import os from 'os';
import { PORT } from '../config';
import { getNetworkAddresses, getPrimaryLanIp, generateQrDataUrl } from '../services/networkService';
import { getRequestOrigin } from '../utils/requestOrigin';

const router = express.Router();

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

import express from 'express';
import mime from 'mime-types';
import { getInstanceConfig, getInstanceLogoPath } from '../services/instanceConfigService';

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

export default router;

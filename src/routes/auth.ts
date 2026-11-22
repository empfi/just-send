import express from 'express';
import sessionService from '../services/sessionService';
import workspaceService from '../services/workspaceService';
import auditService from '../services/auditService';
import { strictLimiter } from '../middleware/rateLimiter';
import { requireSession, authed, parseCookies } from '../middleware/auth';
import { normalizeFingerprint, isValidPublicKey } from '../utils/deviceCrypto';
import { setSessionCookie, clearSessionCookie } from '../utils/sessionCookie';
import { SESSION_COOKIE } from '../services/sessionService';

const router = express.Router();
const seenNonces = new Map<string, number>();
const MAX_CLOCK_SKEW_MS = 120_000;

function pruneNonces(): void {
  const cutoff = Date.now() - MAX_CLOCK_SKEW_MS;
  for (const [key, usedAt] of seenNonces) {
    if (usedAt < cutoff) seenNonces.delete(key);
  }
}

router.post('/session', strictLimiter, (req, res) => {
  try {
    const { workspaceId, deviceId, timestamp, nonce, signature, fingerprint } = req.body as {
      workspaceId?: string;
      deviceId?: string;
      timestamp?: string | number;
      nonce?: string;
      signature?: string;
      fingerprint?: string;
    };

    const fp = normalizeFingerprint(fingerprint);
    if (!workspaceId || !deviceId || !timestamp || !nonce || !signature || !fp) {
      res.status(400).json({ success: false, error: 'Missing or invalid session proof' });
      return;
    }

    const signedAt = Number(timestamp);
    if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > MAX_CLOCK_SKEW_MS) {
      auditService.log('session_stale_proof', { workspaceId, deviceId, ip: req.ip, userAgent: req.headers['user-agent'] });
      res.status(401).json({ success: false, error: 'Session proof expired. Try again.' });
      return;
    }

    if (!/^[a-f0-9]{16,64}$/i.test(nonce)) {
      res.status(400).json({ success: false, error: 'Invalid nonce' });
      return;
    }

    pruneNonces();
    const nonceKey = `${deviceId}:${nonce}`;
    if (seenNonces.has(nonceKey)) {
      auditService.log('session_replay_blocked', { workspaceId, deviceId, ip: req.ip, userAgent: req.headers['user-agent'] });
      res.status(401).json({ success: false, error: 'Replayed session proof rejected' });
      return;
    }

    const data = `${workspaceId}.${deviceId}.${timestamp}.${nonce}`;
    const auth = workspaceService.verifySignatureRequest({ workspaceId, deviceId, data, signature });
    if (!auth) {
      auditService.log('session_bad_signature', {
        workspaceId,
        deviceId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(401).json({ success: false, error: 'Device signature rejected' });
      return;
    }
    seenNonces.set(nonceKey, Date.now());

    const session = sessionService.create(workspaceId, deviceId, fp);
    setSessionCookie(req, res, session.id);
    auditService.log('session_created', {
      workspaceId,
      deviceId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      data: {
        workspace: { id: auth.workspace.id, name: auth.workspace.name },
        deviceId: auth.device.id,
        isMaster: auth.device.isMaster,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/session', requireSession, (req, res) => {
  const auth = authed(req);
  res.json({
    success: true,
    data: {
      workspace: { id: auth.workspace.id, name: auth.workspace.name },
      deviceId: auth.device.id,
      isMaster: auth.device.isMaster,
      expiresAt: auth.session.expiresAt,
    },
  });
});

router.delete('/session', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  sessionService.destroy(cookies[SESSION_COOKIE]);
  clearSessionCookie(res);
  res.json({ success: true });
});

router.post('/devices/upgrade', strictLimiter, (req, res) => {
  try {
    const { workspaceId, token, publicKey, fingerprint } = req.body as {
      workspaceId?: string;
      token?: string;
      publicKey?: unknown;
      fingerprint?: string;
    };
    const fp = normalizeFingerprint(fingerprint);
    if (!workspaceId || !token || !isValidPublicKey(publicKey) || !fp) {
      res.status(400).json({ success: false, error: 'Missing device upgrade details' });
      return;
    }

    const auth = workspaceService.upgradeDeviceKey({
      workspaceId,
      token,
      publicKey,
      fingerprint: fp,
      userAgent: req.headers['user-agent'],
    });
    const session = sessionService.create(workspaceId, auth.device.id, fp);
    setSessionCookie(req, res, session.id);
    auditService.log('device_upgraded_to_key', {
      workspaceId,
      deviceId: auth.device.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      data: {
        workspace: { id: auth.workspace.id, name: auth.workspace.name },
        deviceId: auth.device.id,
        isMaster: auth.device.isMaster,
      },
    });
  } catch (err) {
    res.status(401).json({ success: false, error: (err as Error).message });
  }
});

export default router;

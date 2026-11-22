import express from 'express';
import workspaceService from '../services/workspaceService';
import sessionService from '../services/sessionService';
import auditService from '../services/auditService';
import { authLimiter, strictLimiter } from '../middleware/rateLimiter';
import { requireSession, authed } from '../middleware/auth';
import { generateQrDataUrl } from '../services/networkService';
import { isValidPublicKey, normalizeFingerprint } from '../utils/deviceCrypto';
import { setSessionCookie, clearSessionCookie } from '../utils/sessionCookie';
import sseService from '../services/sseService';
import { getRequestOrigin } from '../utils/requestOrigin';
import { isWorkspaceDeletionAllowed, isWorkspaceLeaveAllowed } from '../services/instanceConfigService';

const router = express.Router();

function requireMaster(action: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const auth = authed(req);
    if (auth.device.isMaster) {
      next();
      return;
    }

    auditService.log('master_action_denied', {
      workspaceId: auth.workspace.id,
      deviceId: auth.device.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      detail: action,
    });
    res.status(403).json({
      success: false,
      error: `Only master devices can ${action}.`,
    });
  };
}

function requireKeyedDevice(body: { publicKey?: unknown; fingerprint?: string }): {
  publicKey: { kty: string; crv: string; x: string; y: string };
  fingerprint: string;
} {
  if (!isValidPublicKey(body.publicKey)) throw new Error('A valid device public key is required');
  const fingerprint = normalizeFingerprint(body.fingerprint);
  if (!fingerprint) throw new Error('Device fingerprint is required');
  return { publicKey: body.publicKey, fingerprint };
}

router.get('/', requireSession, (req, res) => {
  const auth = authed(req);
  res.json({
    success: true,
    data: [
      {
        id: auth.workspace.id,
        name: auth.workspace.name,
        createdAt: auth.workspace.createdAt,
        deviceCount: auth.workspace.devices.filter((device) => !device.revokedAt).length,
      },
    ],
    hasWorkspaces: workspaceService.hasAnyWorkspaces(),
  });
});

router.post('/setup', authLimiter, (req, res) => {
  try {
    const { name, deviceName, publicKey, fingerprint } = req.body as {
      name?: string;
      deviceName?: string;
      publicKey?: unknown;
      fingerprint?: string;
    };
    const keyed = requireKeyedDevice({ publicKey, fingerprint });
    const result = workspaceService.createWorkspace({
      name,
      deviceName,
      publicKey: keyed.publicKey,
      fingerprint: keyed.fingerprint,
      userAgent: req.headers['user-agent'],
    });
    const session = sessionService.create(result.workspace.id, result.deviceId, keyed.fingerprint);
    setSessionCookie(req, res, session.id);
    auditService.log('workspace_created', {
      workspaceId: result.workspace.id,
      deviceId: result.deviceId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

router.post('/recover', strictLimiter, (req, res) => {
  try {
    const { keyphrase, deviceName, publicKey, fingerprint } = req.body as {
      keyphrase?: string;
      deviceName?: string;
      publicKey?: unknown;
      fingerprint?: string;
    };
    const keyed = requireKeyedDevice({ publicKey, fingerprint });
    const result = workspaceService.recoverWithKeyphrase({
      keyphrase,
      deviceName,
      publicKey: keyed.publicKey,
      fingerprint: keyed.fingerprint,
      userAgent: req.headers['user-agent'],
    });
    const session = sessionService.create(result.workspace.id, result.deviceId, keyed.fingerprint);
    setSessionCookie(req, res, session.id);
    auditService.log('workspace_recovered', {
      workspaceId: result.workspace.id,
      deviceId: result.deviceId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(401).json({ success: false, error: (err as Error).message });
  }
});

router.post('/authorize/code', strictLimiter, (req, res) => {
  try {
    const { workspaceId, code, deviceName, publicKey, fingerprint } = req.body as {
      workspaceId?: string;
      code?: string;
      deviceName?: string;
      publicKey?: unknown;
      fingerprint?: string;
    };
    const keyed = requireKeyedDevice({ publicKey, fingerprint });
    const result = workspaceService.authorizeWithCode({
      workspaceId,
      code,
      deviceName,
      publicKey: keyed.publicKey,
      fingerprint: keyed.fingerprint,
      userAgent: req.headers['user-agent'],
    });
    const session = sessionService.create(result.workspace.id, result.deviceId, keyed.fingerprint);
    setSessionCookie(req, res, session.id);
    auditService.log('device_paired_with_code', {
      workspaceId: result.workspace.id,
      deviceId: result.deviceId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(401).json({ success: false, error: (err as Error).message });
  }
});

router.post('/authorize/qr', authLimiter, (req, res) => {
  try {
    const { workspaceId, pairToken, deviceName, publicKey, fingerprint } = req.body as {
      workspaceId?: string;
      pairToken?: string;
      deviceName?: string;
      publicKey?: unknown;
      fingerprint?: string;
    };
    const keyed = requireKeyedDevice({ publicKey, fingerprint });
    const result = workspaceService.authorizeWithQr({
      workspaceId,
      pairToken,
      deviceName,
      publicKey: keyed.publicKey,
      fingerprint: keyed.fingerprint,
      userAgent: req.headers['user-agent'],
    });
    const session = sessionService.create(result.workspace.id, result.deviceId, keyed.fingerprint);
    setSessionCookie(req, res, session.id);
    auditService.log('device_paired_with_qr', {
      workspaceId: result.workspace.id,
      deviceId: result.deviceId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(401).json({ success: false, error: (err as Error).message });
  }
});

router.get('/:id/pairing', authLimiter, requireSession, requireMaster('share access'), async (req, res) => {
  try {
    const auth = authed(req);
    if (auth.workspace.id !== req.params.id) {
      res.status(403).json({ success: false, error: 'Session does not belong to this workspace' });
      return;
    }

    const pairing = workspaceService.getPairingCode(req.params.id);
    if (!pairing) {
      res.status(404).json({ success: false, error: 'Workspace not found' });
      return;
    }

    const pairToken = workspaceService.generatePairingToken(req.params.id);
    const qrTargetUrl = `${getRequestOrigin(req)}/pair?ws=${req.params.id}&token=${pairToken}`;
    const qrDataUrl = await generateQrDataUrl(qrTargetUrl);

    auditService.log('pairing_code_viewed', {
      workspaceId: auth.workspace.id,
      deviceId: auth.device.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      data: {
        workspaceId: req.params.id,
        workspaceName: auth.workspace.name,
        code: pairing.code,
        secondsRemaining: pairing.secondsRemaining,
        qrTargetUrl,
        qrCode: qrDataUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.post('/:id/leave', requireSession, (req, res) => {
  const auth = authed(req);
  if (auth.workspace.id !== req.params.id) {
    res.status(403).json({ success: false, error: 'Session does not belong to this workspace' });
    return;
  }

  if (!isWorkspaceLeaveAllowed()) {
    res.status(403).json({ success: false, error: 'Leaving workspaces is disabled on this instance.' });
    return;
  }

  sessionService.destroy(auth.session.id);
  clearSessionCookie(res);
  auditService.log('workspace_left', {
    workspaceId: req.params.id,
    deviceId: auth.device.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true, data: null });
});

router.delete('/:id', requireSession, requireMaster('delete workspaces'), (req, res) => {
  const auth = authed(req);
  if (auth.workspace.id !== req.params.id) {
    res.status(403).json({ success: false, error: 'Session does not belong to this workspace' });
    return;
  }

  if (!isWorkspaceDeletionAllowed()) {
    res.status(403).json({ success: false, error: 'Deleting workspaces is disabled on this instance.' });
    return;
  }

  if (!workspaceService.deleteWorkspace(req.params.id)) {
    res.status(404).json({ success: false, error: 'Workspace not found' });
    return;
  }

  sessionService.destroyForWorkspace(req.params.id);
  auditService.log('workspace_deleted', {
    workspaceId: req.params.id,
    deviceId: auth.device.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true, data: null });
});

router.get('/:id/devices', requireSession, (req, res) => {
  const auth = authed(req);
  if (auth.workspace.id !== req.params.id) {
    res.status(403).json({ success: false, error: 'Session does not belong to this workspace' });
    return;
  }
  res.json({ success: true, data: workspaceService.getDevices(req.params.id) });
});

router.delete('/:id/devices/:deviceId', requireSession, requireMaster('revoke devices'), (req, res) => {
  const auth = authed(req);
  if (auth.workspace.id !== req.params.id) {
    res.status(403).json({ success: false, error: 'Session does not belong to this workspace' });
    return;
  }
  if (auth.device.id === req.params.deviceId) {
    res.status(400).json({ success: false, error: 'You cannot revoke the device you are using' });
    return;
  }

  const revoked = workspaceService.revokeDevice(req.params.id, req.params.deviceId);
  if (!revoked) {
    res.status(404).json({ success: false, error: 'Device not found' });
    return;
  }
  sessionService.destroyForDevice(req.params.id, req.params.deviceId);
  sseService.broadcast('workspace:device_revoked', {
    workspaceId: req.params.id,
    deviceId: revoked.id,
    deviceName: revoked.name,
  });
  auditService.log('device_revoked', {
    workspaceId: req.params.id,
    deviceId: revoked.id,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    detail: `revoked by ${auth.device.id}`,
  });
  res.json({ success: true, data: revoked });
});

router.get('/:id/audit', requireSession, requireMaster('view the audit log'), (req, res) => {
  const auth = authed(req);
  if (auth.workspace.id !== req.params.id) {
    res.status(403).json({ success: false, error: 'Session does not belong to this workspace' });
    return;
  }
  const entries = auditService.readRecent(req.params.id, 200).map((line) => JSON.parse(line));
  res.json({ success: true, data: entries });
});

export default router;

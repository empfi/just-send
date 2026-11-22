import type { Response } from 'express';

interface SseClient {
  res: Response;
  workspaceId: string;
}

class SSEService {
  private clients = new Map<Response, SseClient>();
  private heartbeat: NodeJS.Timeout;

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const client of this.clients.values()) {
        try {
          client.res.write(': keep-alive\n\n');
        } catch {
          this.clients.delete(client.res);
        }
      }
    }, 25_000);
    this.heartbeat.unref();
  }

  addClient(res: Response, workspaceId: string): void {
    const client: SseClient = { res, workspaceId };
    this.clients.set(res, client);
    res.write('retry: 5000\n\n');
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  broadcast(event: string, payload: Record<string, unknown> = {}): void {
    const workspaceId =
      typeof payload.workspaceId === 'string'
        ? payload.workspaceId
        : event === 'workspace:created' && typeof payload.id === 'string'
          ? payload.id
          : null;

    if (!workspaceId) return;

    const data = JSON.stringify({
      type: event,
      payload,
      timestamp: Date.now(),
    });

    for (const client of this.clients.values()) {
      if (client.workspaceId !== workspaceId) continue;
      try {
        client.res.write(`data: ${data}\n\n`);
      } catch {
        this.clients.delete(client.res);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {
        /* connection already gone */
      }
    }
    this.clients.clear();
  }
}

export default new SSEService();

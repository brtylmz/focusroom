import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { RoomRegistry } from '../domain/registry.js';

export interface AppOptions {
  clientDist: string | null;
}

export function createApp(registry: RoomRegistry, options: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: Date.now() });
  });

  app.get('/api/environments', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(registry.summaries());
  });

  if (options.clientDist && fs.existsSync(options.clientDist)) {
    app.use(express.static(options.clientDist, { index: 'index.html', maxAge: '1h' }));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(options.clientDist!, 'index.html'));
    });
  }

  return app;
}

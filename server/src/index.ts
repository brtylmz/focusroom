import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import blocklist from './config/blocklist.json' with { type: 'json' };
import { serverConfig } from './config.js';
import { RoomRegistry } from './domain/registry.js';
import { createApp } from './http/app.js';
import { createGameServer } from './network/gameServer.js';
import { InMemoryStudyRepository } from './repository/studyRepository.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

const registry = new RoomRegistry({
  studyRepo: new InMemoryStudyRepository(),
  blocklist: blocklist as string[],
});

const app = createApp(registry, { clientDist: fs.existsSync(clientDist) ? clientDist : null });
const httpServer = http.createServer(app);
const game = createGameServer({
  httpServer,
  registry,
  clientOrigin: serverConfig.clientOrigin,
  graceMs: serverConfig.graceMs,
});

httpServer.listen(serverConfig.port, () => {
  console.log(`[server] listening on http://localhost:${serverConfig.port}`);
});

const shutdown = () => {
  game.stop();
  httpServer.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

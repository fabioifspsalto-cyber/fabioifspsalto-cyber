import path from 'node:path';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { localStorage } from './storage.js';
import { mockProvider } from './ai/mock.js';
import { httpProvider } from './ai/http.js';
import { config } from './config.js';

const db = await openDb(path.join(config.dataDir, 'db'));
const storage = localStorage(path.join(config.dataDir, 'files'));
const provider = config.aiProvider === 'http' ? httpProvider : mockProvider;
const app = await buildApp({ db, storage, provider });

setInterval(() => app.purgeExpired().catch(console.error), 60 * 60 * 1000).unref();
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`API em :${config.port} (IA: ${provider.name})`);

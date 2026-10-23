import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3333),
  dataDir: process.env.DATA_DIR ?? path.resolve('data'),
  adminToken: process.env.ADMIN_TOKEN ?? '',
  // Provedor de IA: "mock" (dev) ou "http" (serviço de inpainting no Brasil).
  aiProvider: process.env.AI_PROVIDER ?? 'mock',
  aiUrl: process.env.AI_URL ?? '',
  aiToken: process.env.AI_TOKEN ?? '',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 15000),
  maxPhotoBytes: 8 * 1024 * 1024,
};

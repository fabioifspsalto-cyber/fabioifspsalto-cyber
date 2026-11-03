import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Interface pensada para trocar por S3 (sa-east-1) com SSE-KMS e URLs assinadas.
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export function localStorage(root: string): Storage {
  const resolve = (key: string) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error('invalid key');
    return full;
  };
  return {
    async put(key, data) {
      const p = resolve(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, data);
    },
    get: (key) => readFile(resolve(key)),
    remove: (key) => rm(resolve(key), { force: true }),
  };
}

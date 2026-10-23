import sharp from 'sharp';
import type { AiProvider, SimulationInput } from './provider.js';

// Provedor de DESENVOLVIMENTO: não é IA generativa. Clareia pixels com cara
// de dente dentro do retângulo da boca, só para exercitar o fluxo ponta a ponta.
const STRENGTH = { lentes: 0.55, clareamento: 0.4, alinhadores: 0.2 } as const;

export const mockProvider: AiProvider = {
  name: 'mock',
  async simulate({ photo, treatment, mouth }: SimulationInput) {
    const img = sharp(photo).rotate().resize({ width: 1280, withoutEnlargement: true });
    const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const x0 = Math.floor(mouth.x * info.width), x1 = Math.ceil((mouth.x + mouth.w) * info.width);
    const y0 = Math.floor(mouth.y * info.height), y1 = Math.ceil((mouth.y + mouth.h) * info.height);
    const k = STRENGTH[treatment];
    for (let y = y0; y < Math.min(y1, info.height); y++) {
      for (let x = x0; x < Math.min(x1, info.width); x++) {
        const i = (y * info.width + x) * 3;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        if (max > 110 && sat < 0.38) { // heurística de "esmalte"
          data[i] = r + (252 - r) * k;
          data[i + 1] = g + (252 - g) * k;
          data[i + 2] = b + (250 - b) * k;
        }
      }
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
      .jpeg({ quality: 88 }).toBuffer();
  },
};

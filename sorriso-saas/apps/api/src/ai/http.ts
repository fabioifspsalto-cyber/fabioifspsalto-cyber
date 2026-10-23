import type { AiProvider, SimulationInput } from './provider.js';
import { config } from '../config.js';

// Contrato esperado do serviço de inpainting (GPU, região Brasil):
//   POST {AI_URL}  multipart: photo, treatment, mouth(JSON)  ->  image/jpeg
// O serviço deve processar em memória e NÃO reter nem treinar com a imagem.
export const httpProvider: AiProvider = {
  name: 'http',
  async simulate({ photo, treatment, mouth }: SimulationInput) {
    if (!config.aiUrl) throw new Error('AI_URL não configurada');
    const form = new FormData();
    form.set('photo', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'photo.jpg');
    form.set('treatment', treatment);
    form.set('mouth', JSON.stringify(mouth));
    const res = await fetch(config.aiUrl, {
      method: 'POST',
      headers: config.aiToken ? { authorization: `Bearer ${config.aiToken}` } : {},
      body: form,
      signal: AbortSignal.timeout(config.aiTimeoutMs),
    });
    if (!res.ok) throw new Error(`provedor de IA respondeu ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },
};

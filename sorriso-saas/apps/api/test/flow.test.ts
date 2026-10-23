import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from '../src/config.js';
import { openDb } from '../src/db.js';
import { localStorage } from '../src/storage.js';
import { mockProvider } from '../src/ai/mock.js';
import { buildApp, TERM_VERSION } from '../src/app.js';

config.adminToken = 'admin-test';

function multipart(fields: Record<string, string>, photo: Buffer) {
  const b = '----t' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields))
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="photo"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`), photo, Buffer.from(`\r\n--${b}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}

describe('fluxo completo', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let key: string, key2: string, photo: Buffer;

  beforeAll(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ss-'));
    app = await buildApp({ db: await openDb(), storage: localStorage(dir), provider: mockProvider });
    const mk = async (name: string) =>
      (await app.inject({ method: 'POST', url: '/v1/clinics', headers: { authorization: 'Bearer admin-test' }, payload: { name } })).json().apiKey as string;
    key = await mk('Clínica Sorriso'); key2 = await mk('Outra Clínica');
    // "rosto" sintético: pele + faixa de dentes claros
    photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#c68c6b' } })
      .composite([{ input: await sharp({ create: { width: 300, height: 80, channels: 3, background: '#d9d2b8' } }).png().toBuffer(), left: 250, top: 700 }])
      .jpeg().toBuffer();
  });

  const consent = async (k: string, over = {}) => app.inject({
    method: 'POST', url: '/v1/consents', headers: { 'x-clinic-key': k },
    payload: { patientName: 'Maria Souza', simulation: true, termVersion: TERM_VERSION, ...over },
  });

  it('rejeita sem chave e cadastro sem token de admin', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/clinic' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/v1/clinics', payload: { name: 'xx' } })).statusCode).toBe(401);
  });

  it('exige consentimento de simulação', async () => {
    expect((await consent(key, { simulation: false })).statusCode).toBe(400);
  });

  it('gera simulação (<15s), exporta PDF, isola clínicas e apaga dados', async () => {
    const { consentId, patientId } = (await consent(key)).json();
    const m = multipart({ treatment: 'lentes', consentId, mouth: JSON.stringify({ x: 0.28, y: 0.68, w: 0.4, h: 0.12 }) }, photo);
    const res = await app.inject({ method: 'POST', url: '/v1/simulations', headers: { 'x-clinic-key': key, ...m.headers }, payload: m.payload });
    expect(res.statusCode).toBe(201);
    const sim = res.json();
    expect(sim.durationMs).toBeLessThan(15000);

    const before = await sharp((await app.inject({ method: 'GET', url: `/v1/simulations/${sim.id}/before`, headers: { 'x-clinic-key': key } })).rawPayload).raw().toBuffer();
    const after = await sharp((await app.inject({ method: 'GET', url: `/v1/simulations/${sim.id}/after`, headers: { 'x-clinic-key': key } })).rawPayload).raw().toBuffer();
    expect(Buffer.compare(before, after)).not.toBe(0);

    const pdf = await app.inject({ method: 'POST', url: `/v1/simulations/${sim.id}/pdf`, headers: { 'x-clinic-key': key },
      payload: { items: [{ description: 'Lentes (8 dentes)', price: 12000 }] } });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');

    // outra clínica não enxerga
    expect((await app.inject({ method: 'GET', url: `/v1/simulations/${sim.id}/after`, headers: { 'x-clinic-key': key2 } })).statusCode).toBe(404);

    // eliminação a pedido do titular
    expect((await app.inject({ method: 'DELETE', url: `/v1/patients/${patientId}`, headers: { 'x-clinic-key': key } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/v1/simulations/${sim.id}/after`, headers: { 'x-clinic-key': key } })).statusCode).toBe(404);
  });

  it('revogar consentimento bloqueia e apaga imagens', async () => {
    const { consentId } = (await consent(key)).json();
    const m = () => multipart({ treatment: 'clareamento', consentId, mouth: JSON.stringify({ x: 0.28, y: 0.68, w: 0.4, h: 0.12 }) }, photo);
    const a = m();
    const sim = (await app.inject({ method: 'POST', url: '/v1/simulations', headers: { 'x-clinic-key': key, ...a.headers }, payload: a.payload })).json();
    await app.inject({ method: 'POST', url: `/v1/consents/${consentId}/revoke`, headers: { 'x-clinic-key': key } });
    expect((await app.inject({ method: 'GET', url: `/v1/simulations/${sim.id}/before`, headers: { 'x-clinic-key': key } })).statusCode).toBe(404);
    const b = m();
    expect((await app.inject({ method: 'POST', url: '/v1/simulations', headers: { 'x-clinic-key': key, ...b.headers }, payload: b.payload })).statusCode).toBe(403);
  });
});

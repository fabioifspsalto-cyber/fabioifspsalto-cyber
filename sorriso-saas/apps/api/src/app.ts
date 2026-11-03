import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { z } from 'zod';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Db } from './db.js';
import type { Storage } from './storage.js';
import type { AiProvider } from './ai/provider.js';
import { buildPdf } from './pdf.js';
import { config } from './config.js';

export const TERM_VERSION = '2026-10-v1';
const TREATMENT_LABEL = { lentes: 'Lentes de contato dental', clareamento: 'Clareamento dental', alinhadores: 'Alinhadores ortodônticos' } as const;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const HEX = /^#[0-9a-fA-F]{6}$/;

interface Clinic { id: string; name: string; brand_color: string; logo_path: string | null; retention_days: number }
declare module 'fastify' { interface FastifyRequest { clinic?: Clinic } }

export interface Deps { db: Db; storage: Storage; provider: AiProvider }

export async function buildApp({ db, storage, provider }: Deps) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: config.maxPhotoBytes, files: 1, fields: 8 } });

  const audit = (clinicId: string, action: string, subjectId?: string) =>
    db.query('INSERT INTO audit_log (clinic_id, action, subject_id) VALUES ($1,$2,$3)', [clinicId, action, subjectId ?? null]);

  // --- autenticação por chave da clínica (MVP; trocar por login + MFA) ---
  async function requireClinic(req: FastifyRequest, reply: FastifyReply) {
    const key = req.headers['x-clinic-key'];
    if (typeof key !== 'string') return reply.code(401).send({ error: 'chave ausente' });
    const r = await db.query<Clinic>(
      'SELECT id,name,brand_color,logo_path,retention_days FROM clinics WHERE api_key_hash=$1', [sha256(key)]);
    if (!r.rows[0]) return reply.code(401).send({ error: 'chave inválida' });
    req.clinic = r.rows[0];
  }

  app.get('/health', async () => ({ ok: true }));

  // --- cadastro de clínica (somente administrador do SaaS) ---
  app.post('/v1/clinics', async (req, reply) => {
    const auth = String(req.headers.authorization ?? '');
    const expected = `Bearer ${config.adminToken}`;
    if (!config.adminToken || auth.length !== expected.length ||
        !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) return reply.code(401).send({ error: 'não autorizado' });
    const body = z.object({
      name: z.string().min(2).max(120),
      brandColor: z.string().regex(HEX).default('#2EC4B6'),
      retentionDays: z.number().int().min(1).max(365).default(90),
    }).parse(req.body);
    const id = randomUUID(), apiKey = `clk_${randomBytes(24).toString('hex')}`;
    await db.query('INSERT INTO clinics (id,name,brand_color,retention_days,api_key_hash) VALUES ($1,$2,$3,$4,$5)',
      [id, body.name, body.brandColor, body.retentionDays, sha256(apiKey)]);
    return reply.code(201).send({ id, apiKey }); // a chave só é exibida agora
  });

  app.get('/v1/clinic', { preHandler: requireClinic }, async (req) => {
    const c = req.clinic!;
    return { id: c.id, name: c.name, brandColor: c.brand_color, hasLogo: !!c.logo_path, retentionDays: c.retention_days, termVersion: TERM_VERSION };
  });

  app.put('/v1/clinic/logo', { preHandler: requireClinic }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'arquivo ausente' });
    const png = await sharp(await file.toBuffer()).resize({ height: 160, withoutEnlargement: true }).png().toBuffer();
    const key = `${req.clinic!.id}/logo.png`;
    await storage.put(key, png);
    await db.query('UPDATE clinics SET logo_path=$1 WHERE id=$2', [key, req.clinic!.id]);
    return { ok: true };
  });

  // --- consentimento (LGPD art. 11, I): específico, por finalidade, versionado ---
  app.post('/v1/consents', { preHandler: requireClinic }, async (req, reply) => {
    const body = z.object({
      patientName: z.string().min(2).max(160),
      simulation: z.literal(true, { errorMap: () => ({ message: 'consentimento para simulação é obrigatório' }) }),
      marketingUse: z.boolean().default(false),
      aiTraining: z.boolean().default(false),
      signaturePng: z.string().startsWith('data:image/png;base64,').max(400_000).optional(),
      termVersion: z.literal(TERM_VERSION),
    }).parse(req.body);
    const clinicId = req.clinic!.id, patientId = randomUUID(), consentId = randomUUID();
    await db.query('INSERT INTO patients (id,clinic_id,full_name) VALUES ($1,$2,$3)', [patientId, clinicId, body.patientName]);
    await db.query(
      'INSERT INTO consents (id,clinic_id,patient_id,term_version,simulation,marketing_use,ai_training,signature_png) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [consentId, clinicId, patientId, body.termVersion, true, body.marketingUse, body.aiTraining, body.signaturePng ?? null]);
    await audit(clinicId, 'consent.granted', consentId);
    return reply.code(201).send({ patientId, consentId });
  });

  app.post('/v1/consents/:id/revoke', { preHandler: requireClinic }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const clinicId = req.clinic!.id;
    const c = await db.query<{ patient_id: string }>(
      'UPDATE consents SET revoked_at=now() WHERE id=$1 AND clinic_id=$2 AND revoked_at IS NULL RETURNING patient_id', [id, clinicId]);
    if (!c.rows[0]) return reply.code(404).send({ error: 'consentimento não encontrado' });
    // Revogação elimina as imagens que dependiam desse consentimento.
    await deleteSimulations(clinicId, `consent_id=$2 AND clinic_id=$1`, [clinicId, id]);
    await audit(clinicId, 'consent.revoked', id);
    return { ok: true };
  });

  async function deleteSimulations(clinicId: string, where: string, params: unknown[]) {
    const rows = await db.query<{ id: string; before_path: string; after_path: string }>(
      `SELECT id,before_path,after_path FROM simulations WHERE ${where}`, params);
    for (const s of rows.rows) {
      await storage.remove(s.before_path); await storage.remove(s.after_path);
      await db.query('DELETE FROM simulations WHERE id=$1', [s.id]);
      await audit(clinicId, 'simulation.deleted', s.id);
    }
  }

  // --- simulação ---
  app.post('/v1/simulations', { preHandler: requireClinic }, async (req, reply) => {
    const clinic = req.clinic!;
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'foto ausente' });
    const f = file.fields as Record<string, { value?: string } | undefined>;
    const parsed = z.object({
      treatment: z.enum(['lentes', 'clareamento', 'alinhadores']),
      consentId: z.string().uuid(),
      mouth: z.string().transform((s) => JSON.parse(s)).pipe(z.object({
        x: z.number().min(0).max(1), y: z.number().min(0).max(1),
        w: z.number().min(0.05).max(1), h: z.number().min(0.03).max(1),
      })),
    }).safeParse({ treatment: f.treatment?.value, consentId: f.consentId?.value, mouth: f.mouth?.value });
    if (!parsed.success) return reply.code(400).send({ error: 'parâmetros inválidos', details: parsed.error.issues });
    const { treatment, consentId, mouth } = parsed.data;

    const consent = await db.query<{ patient_id: string }>(
      'SELECT patient_id FROM consents WHERE id=$1 AND clinic_id=$2 AND simulation=true AND revoked_at IS NULL', [consentId, clinic.id]);
    if (!consent.rows[0]) return reply.code(403).send({ error: 'sem consentimento válido para simulação' });

    let photo: Buffer;
    try {
      // Re-codifica: valida que é imagem e descarta EXIF/GPS.
      photo = await sharp(await file.toBuffer()).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    } catch { return reply.code(400).send({ error: 'imagem inválida' }); }

    const t0 = Date.now();
    let after: Buffer;
    try { after = await provider.simulate({ photo, treatment, mouth }); }
    catch (e) { req.log.error(e); return reply.code(502).send({ error: 'falha ao gerar a simulação' }); }
    const durationMs = Date.now() - t0;

    const id = randomUUID();
    const beforePath = `${clinic.id}/${id}/before.jpg`, afterPath = `${clinic.id}/${id}/after.jpg`;
    await storage.put(beforePath, photo); await storage.put(afterPath, after);
    const expires = new Date(Date.now() + clinic.retention_days * 86_400_000).toISOString();
    await db.query(
      'INSERT INTO simulations (id,clinic_id,patient_id,consent_id,treatment,before_path,after_path,provider,duration_ms,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, clinic.id, consent.rows[0].patient_id, consentId, treatment, beforePath, afterPath, provider.name, durationMs, expires]);
    await audit(clinic.id, 'simulation.created', id);
    return reply.code(201).send({ id, durationMs, expiresAt: expires });
  });

  async function loadSim(req: FastifyRequest) {
    const { id } = req.params as { id: string };
    const r = await db.query<{ id: string; patient_id: string; treatment: keyof typeof TREATMENT_LABEL; before_path: string; after_path: string }>(
      'SELECT id,patient_id,treatment,before_path,after_path FROM simulations WHERE id=$1 AND clinic_id=$2', [id, req.clinic!.id]);
    return r.rows[0];
  }

  app.get('/v1/simulations/:id/:which(before|after)', { preHandler: requireClinic }, async (req, reply) => {
    const sim = await loadSim(req);
    if (!sim) return reply.code(404).send({ error: 'não encontrada' });
    const which = (req.params as { which: string }).which;
    await audit(req.clinic!.id, `simulation.viewed.${which}`, sim.id);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-store')
      .send(await storage.get(which === 'before' ? sim.before_path : sim.after_path));
  });

  app.post('/v1/simulations/:id/pdf', { preHandler: requireClinic }, async (req, reply) => {
    const sim = await loadSim(req);
    if (!sim) return reply.code(404).send({ error: 'não encontrada' });
    const body = z.object({
      items: z.array(z.object({ description: z.string().min(1).max(120), price: z.number().min(0).max(1_000_000) })).min(1).max(12),
      validityDays: z.number().int().min(1).max(365).default(15),
    }).parse(req.body);
    const clinic = req.clinic!;
    const patient = await db.query<{ full_name: string }>('SELECT full_name FROM patients WHERE id=$1 AND clinic_id=$2', [sim.patient_id, clinic.id]);
    const pdf = await buildPdf({
      clinicName: clinic.name, brandColor: clinic.brand_color,
      logo: clinic.logo_path ? await storage.get(clinic.logo_path) : undefined,
      patientName: patient.rows[0].full_name, treatmentLabel: TREATMENT_LABEL[sim.treatment],
      before: await storage.get(sim.before_path), after: await storage.get(sim.after_path),
      items: body.items, validityDays: body.validityDays,
    });
    await audit(clinic.id, 'pdf.exported', sim.id);
    return reply.header('content-type', 'application/pdf').header('cache-control', 'private, no-store').send(pdf);
  });

  // --- direitos do titular (art. 18): eliminação ---
  app.delete('/v1/patients/:id', { preHandler: requireClinic }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const clinicId = req.clinic!.id;
    const p = await db.query('SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2', [id, clinicId]);
    if (!p.rows[0]) return reply.code(404).send({ error: 'paciente não encontrado' });
    await deleteSimulations(clinicId, 'patient_id=$2 AND clinic_id=$1', [clinicId, id]);
    await db.query('DELETE FROM consents WHERE patient_id=$1 AND clinic_id=$2', [id, clinicId]);
    await db.query('DELETE FROM patients WHERE id=$1 AND clinic_id=$2', [id, clinicId]);
    await audit(clinicId, 'patient.erased', id);
    return reply.code(204).send();
  });

  // --- retenção: apaga simulações vencidas ---
  app.decorate('purgeExpired', async () => {
    const rows = await db.query<{ id: string; clinic_id: string }>('SELECT id,clinic_id FROM simulations WHERE expires_at < now()');
    for (const r of rows.rows) await deleteSimulations(r.clinic_id, 'id=$2 AND clinic_id=$1', [r.clinic_id, r.id]);
    return rows.rows.length;
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'dados inválidos', details: err.issues });
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    reply.code(status).send({ error: status === 500 ? 'erro interno' : e.message });
  });

  return app;
}

declare module 'fastify' { interface FastifyInstance { purgeExpired(): Promise<number> } }

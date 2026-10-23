-- Multi-clínica: toda tabela de dados de paciente carrega clinic_id.
-- Em produção (Postgres gerenciado) adicionar RLS por clinic_id.
CREATE TABLE IF NOT EXISTS clinics (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  brand_color   TEXT NOT NULL DEFAULT '#2EC4B6',
  logo_path     TEXT,
  api_key_hash  TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL DEFAULT 90,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id          TEXT PRIMARY KEY,
  clinic_id   TEXT NOT NULL REFERENCES clinics(id),
  full_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consentimento específico por finalidade (LGPD art. 11, I) e versionado.
CREATE TABLE IF NOT EXISTS consents (
  id               TEXT PRIMARY KEY,
  clinic_id        TEXT NOT NULL REFERENCES clinics(id),
  patient_id       TEXT NOT NULL REFERENCES patients(id),
  term_version     TEXT NOT NULL,
  simulation       BOOLEAN NOT NULL,
  marketing_use    BOOLEAN NOT NULL DEFAULT false,
  ai_training      BOOLEAN NOT NULL DEFAULT false,
  signature_png    TEXT,
  granted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS simulations (
  id           TEXT PRIMARY KEY,
  clinic_id    TEXT NOT NULL REFERENCES clinics(id),
  patient_id   TEXT NOT NULL REFERENCES patients(id),
  consent_id   TEXT NOT NULL REFERENCES consents(id),
  treatment    TEXT NOT NULL,
  before_path  TEXT NOT NULL,
  after_path   TEXT NOT NULL,
  provider     TEXT NOT NULL,
  duration_ms  INTEGER NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log de auditoria sem dado pessoal (sobrevive à exclusão do paciente).
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  clinic_id  TEXT NOT NULL,
  action     TEXT NOT NULL,
  subject_id TEXT,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

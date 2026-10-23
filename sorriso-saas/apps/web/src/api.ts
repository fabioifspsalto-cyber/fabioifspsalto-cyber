const KEY = 'clinic-key';
export const getKey = () => { try { return sessionStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const setKey = (k: string) => { try { sessionStorage.setItem(KEY, k); } catch { /* sem storage */ } };

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), 'x-clinic-key': getKey() } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erro ${res.status}`);
  }
  return res;
}

export type Treatment = 'lentes' | 'clareamento' | 'alinhadores';
export interface Clinic { name: string; brandColor: string; termVersion: string }

export const getClinic = async (): Promise<Clinic> => (await call('/v1/clinic')).json();

export const createConsent = async (b: { patientName: string; marketingUse: boolean; aiTraining: boolean; termVersion: string }) =>
  (await call('/v1/consents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...b, simulation: true }) })).json() as Promise<{ patientId: string; consentId: string }>;

export async function simulate(photo: Blob, treatment: Treatment, consentId: string) {
  const f = new FormData();
  f.set('treatment', treatment);
  f.set('consentId', consentId);
  f.set('mouth', JSON.stringify({ x: 0.25, y: 0.62, w: 0.5, h: 0.2 })); // área da guia na tela
  f.set('photo', photo, 'photo.jpg');
  return (await call('/v1/simulations', { method: 'POST', body: f })).json() as Promise<{ id: string; durationMs: number }>;
}

export const imageUrl = async (id: string, which: 'before' | 'after') =>
  URL.createObjectURL(await (await call(`/v1/simulations/${id}/${which}`)).blob());

export const exportPdf = async (id: string, items: { description: string; price: number }[]) =>
  URL.createObjectURL(await (await call(`/v1/simulations/${id}/pdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) })).blob());

export const eraseSession = (patientId: string) => call(`/v1/patients/${patientId}`, { method: 'DELETE' });

import { useEffect, useRef, useState } from 'react';
import * as api from './api';
import type { Treatment, Clinic } from './api';

const STEPS = ['Consentimento', 'Foto', 'Tratamento', 'Resultado'];
const TREATMENTS: { id: Treatment; name: string; desc: string }[] = [
  { id: 'lentes', name: 'Lentes de contato', desc: 'Forma, cor e alinhamento harmonizados' },
  { id: 'clareamento', name: 'Clareamento', desc: 'Tom mais claro, mantendo o natural' },
  { id: 'alinhadores', name: 'Alinhadores', desc: 'Posição dos dentes corrigida' },
];

export function App() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [session, setSession] = useState<{ patientId: string; consentId: string } | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [treatment, setTreatment] = useState<Treatment>('lentes');
  const [sim, setSim] = useState<{ id: string; durationMs: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (api.getKey()) api.getClinic().then(setClinic).catch(() => {}); }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!clinic) {
    return (
      <div className="shell"><div className="card" style={{ maxWidth: 480, margin: '10vh auto' }}>
        <h2>Entrar na clínica</h2>
        <label className="field">Chave de acesso
          <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} /></label>
        <button disabled={busy || !keyInput} onClick={() => run(async () => { api.setKey(keyInput); setClinic(await api.getClinic()); })}>Entrar</button>
        {error && <p className="err">{error}</p>}
      </div></div>
    );
  }

  const restart = async () => {
    if (session) await run(async () => { await api.eraseSession(session.patientId); });
    setSession(null); setPhoto(null); setSim(null); setStep(0);
  };

  return (
    <div className="shell" style={{ ['--aqua' as string]: clinic.brandColor }}>
      <header className="top"><h1>{clinic.name}</h1>
        {session && <button className="ghost" onClick={restart} disabled={busy}>Encerrar e apagar dados do paciente</button>}</header>
      <ol className="steps">{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : ''}>{i + 1}. {s}</li>)}</ol>
      {step === 0 && <Consent clinic={clinic} busy={busy} onDone={(v) => run(async () => { setSession(await api.createConsent({ ...v, termVersion: clinic.termVersion })); setStep(1); })} />}
      {step === 1 && <Camera onCapture={(b) => { setPhoto(b); setStep(2); }} />}
      {step === 2 && (
        <div className="card"><h2>Escolha o tratamento</h2>
          <div className="treatments">{TREATMENTS.map((t) => (
            <button key={t.id} className={`treatment ${treatment === t.id ? 'sel' : ''}`} onClick={() => setTreatment(t.id)}>{t.name}<span>{t.desc}</span></button>))}
          </div>
          <div className="row">
            <button className="ghost" onClick={() => setStep(1)}>Refazer foto</button>
            <button disabled={busy} onClick={() => run(async () => { setSim(await api.simulate(photo!, treatment, session!.consentId)); setStep(3); })}>
              {busy ? 'Gerando simulação…' : 'Gerar simulação'}</button>
          </div>
        </div>)}
      {step === 3 && sim && <Result simId={sim.id} ms={sim.durationMs} />}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

function Consent({ clinic, busy, onDone }: { clinic: Clinic; busy: boolean; onDone: (v: { patientName: string; marketingUse: boolean; aiTraining: boolean }) => void }) {
  const [name, setName] = useState('');
  const [sim, setSim] = useState(false);
  const [mkt, setMkt] = useState(false);
  const [train, setTrain] = useState(false);
  return (
    <div className="card"><h2>Termo de consentimento</h2>
      <p className="hint">{clinic.name} tratará a foto do seu rosto/sorriso (dado pessoal sensível, de saúde) apenas para gerar a simulação e o orçamento. As imagens ficam em servidor criptografado, são apagadas automaticamente após o prazo da clínica e você pode pedir a exclusão a qualquer momento.</p>
      <label className="field">Nome do paciente
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
      <label className="check"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} />
        <span>Autorizo o uso da minha foto para a simulação do tratamento e para o orçamento. <small>Obrigatório.</small></span></label>
      <label className="check"><input type="checkbox" checked={mkt} onChange={(e) => setMkt(e.target.checked)} />
        <span>Autorizo a clínica a divulgar o antes e depois em suas redes. <small>Opcional — não afeta o atendimento.</small></span></label>
      <label className="check"><input type="checkbox" checked={train} onChange={(e) => setTrain(e.target.checked)} />
        <span>Autorizo o uso da imagem para aprimorar a inteligência artificial. <small>Opcional — não afeta o atendimento.</small></span></label>
      <div className="row"><button disabled={busy || !sim || name.trim().length < 2} onClick={() => onDone({ patientName: name.trim(), marketingUse: mkt, aiTraining: train })}>Concordo e continuar</button></div>
    </div>
  );
}

function Camera({ onCapture }: { onCapture: (b: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | undefined;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false })
      .then((s) => { stream = s; if (video.current) video.current.srcObject = s; })
      .catch(() => setErr('Não foi possível acessar a câmera. Verifique a permissão do navegador (é necessário HTTPS).'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  const snap = () => {
    const v = video.current!;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b), 'image/jpeg', 0.92);
  };
  return (
    <div className="card"><h2>Foto do sorriso</h2>
      <p className="hint">Peça para o paciente sorrir mostrando os dentes e alinhe o sorriso à guia tracejada.</p>
      <div className="video-wrap"><video ref={video} autoPlay playsInline muted /><div className="guide" /></div>
      {err && <p className="err">{err}</p>}
      <div className="row"><button onClick={snap} disabled={!!err}>Tirar foto</button></div>
    </div>
  );
}

function Result({ simId, ms }: { simId: string; ms: number }) {
  const [urls, setUrls] = useState<{ before: string; after: string } | null>(null);
  const [pos, setPos] = useState(50);
  const [items, setItems] = useState([{ description: 'Tratamento', price: 0 }]);
  const [err, setErr] = useState('');
  useEffect(() => { Promise.all([api.imageUrl(simId, 'before'), api.imageUrl(simId, 'after')]).then(([before, after]) => setUrls({ before, after })).catch((e) => setErr(e.message)); }, [simId]);
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 && e.type !== 'pointerdown') return;
    const r = e.currentTarget.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };
  const pdf = async () => {
    try { window.open(await api.exportPdf(simId, items.filter((i) => i.description && i.price >= 0)), '_blank'); }
    catch (e) { setErr((e as Error).message); }
  };
  if (!urls) return <div className="card">{err ? <p className="err">{err}</p> : 'Carregando…'}</div>;
  return (
    <div className="card"><h2>Antes × Depois</h2>
      <p className="hint">Simulação gerada em {(ms / 1000).toFixed(1)} s. Arraste para comparar.</p>
      <div className="compare" onPointerDown={move} onPointerMove={move}>
        <img src={urls.after} alt="Depois" draggable={false} />
        <img src={urls.before} alt="Antes" draggable={false} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <span className="tag" style={{ left: 12 }}>Antes</span><span className="tag" style={{ right: 12 }}>Depois</span>
        <div className="handle" style={{ left: `${pos}%` }} />
      </div>
      <p className="disclaimer">Imagem ilustrativa; o resultado real depende de avaliação clínica.</p>
      <h2 style={{ marginTop: 24 }}>Orçamento</h2>
      <table className="quote"><tbody>{items.map((it, i) => (
        <tr key={i}>
          <td><input type="text" aria-label="Descrição" value={it.description} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></td>
          <td style={{ width: 160 }}><input type="text" inputMode="decimal" aria-label="Valor (R$)" value={it.price || ''} placeholder="R$" onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, price: Number(e.target.value.replace(',', '.')) || 0 } : x))} /></td>
        </tr>))}</tbody></table>
      <div className="row">
        <button className="ghost" onClick={() => setItems([...items, { description: '', price: 0 }])}>+ Item</button>
        <button onClick={pdf} disabled={!items.some((i) => i.description)}>Exportar PDF</button>
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

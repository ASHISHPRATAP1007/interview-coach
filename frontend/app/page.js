'use client';
import { useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function api(path, body) {
  const res = await fetch(`${API}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Kuch gadbad ho gayi. Dobara try karo.');
  return data.text;
}

function useSpeech(onFinal) {
  const rec = useRef(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;
  const [on, setOn] = useState(false);
  const [error, setError] = useState('');

  function toggle() {
    if (on) { rec.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError('Is browser mein mic support nahi hai. Chrome use karo ya type karo.'); return; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = 'en-IN';
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) cb.current(e.results[i][0].transcript.trim());
      }
    };
    r.onend = () => setOn(false);
    r.onerror = () => { setOn(false); setError('Mic shuru nahi hua. Permission check karo.'); };
    rec.current = r;
    setError('');
    r.start();
    setOn(true);
  }
  return { on, toggle, error };
}

const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-900';
const btnCls =
  'rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50';
const btn2Cls =
  'rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800';

function Out({ text, error }) {
  if (!text && !error) return null;
  return (
    <div className={`mt-3 whitespace-pre-wrap break-words rounded-md border p-3 text-sm ${
      error ? 'border-red-300 text-red-700 dark:text-red-300' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
      {error || text}
    </div>
  );
}

function Mock({ role, notes }) {
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState([]);
  const [answer, setAnswer] = useState('');
  const [fb, setFb] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const speech = useSpeech((t) => setAnswer((a) => (a ? a + ' ' : '') + t));

  async function run(fn) {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const next = () => run(async () => {
    const t = await api('question', { role, notes, asked });
    setQ(t); setAsked((a) => [...a, t]); setAnswer(''); setFb('');
  });
  const send = () => run(async () => {
    setFb(await api('feedback', { role, notes, question: q, answer }));
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <button className={btnCls} onClick={next} disabled={busy}>{q ? 'Agla sawal' : 'Pehla sawal poochho'}</button>
        {asked.length > 0 && <span className="text-sm text-slate-500">Sawal {asked.length}</span>}
      </div>
      {q && <p className="rounded-md bg-teal-50 p-3 font-medium dark:bg-teal-950">{q}</p>}
      {q && (
        <>
          <label className="block text-sm font-medium" htmlFor="ans">Aapka jawab</label>
          <textarea id="ans" rows={5} className={inputCls} value={answer}
            onChange={(e) => setAnswer(e.target.value)} placeholder="Yahan likho ya mic se bolo" />
          <div className="flex flex-wrap gap-2">
            <button className={btnCls} onClick={send} disabled={busy || !answer.trim()}>Feedback lo</button>
            <button className={btn2Cls} onClick={speech.toggle}>{speech.on ? 'Mic rokho' : 'Bolkar jawab do'}</button>
          </div>
        </>
      )}
      {speech.error && <p className="text-sm text-red-600">{speech.error}</p>}
      {busy && <p className="text-sm text-slate-500">Soch raha hoon…</p>}
      <Out text={fb} error={err} />
    </section>
  );
}

function Live({ role, notes }) {
  const [transcript, setTranscript] = useState('');
  const [auto, setAuto] = useState(true);
  const [sug, setSug] = useState('');
  const [nts, setNts] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const tRef = useRef('');
  const autoRef = useRef(true);
  autoRef.current = auto;

  const set = (v) => { tRef.current = v; setTranscript(v); };

  async function call(path, setter, text) {
    setBusy(true); setErr('');
    try { setter(await api(path, { role, notes, transcript: text })); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const speech = useSpeech((t) => {
    const next = (tRef.current ? tRef.current + ' ' : '') + t;
    set(next);
    if (autoRef.current && t.endsWith('?')) call('suggest', setSug, next);
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnCls} onClick={speech.toggle}>{speech.on ? 'Mic rokho' : 'Sunna shuru karo'}</button>
        <button className={btn2Cls} disabled={busy || !transcript.trim()} onClick={() => call('suggest', setSug, transcript)}>Jawab suggest karo</button>
        <button className={btn2Cls} disabled={busy || !transcript.trim()} onClick={() => call('notes', setNts, transcript)}>Notes banao</button>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto answer
        </label>
      </div>
      <p className="text-sm text-slate-500">{speech.on ? 'Sun raha hoon…' : 'Mic band hai.'}</p>
      {speech.error && <p className="text-sm text-red-600">{speech.error}</p>}
      <label className="block text-sm font-medium" htmlFor="tr">Transcript (type ya paste bhi kar sakte ho)</label>
      <textarea id="tr" rows={6} className={inputCls} value={transcript} onChange={(e) => set(e.target.value)} />
      {busy && <p className="text-sm text-slate-500">Soch raha hoon…</p>}
      {sug && <><h3 className="text-sm font-semibold">Suggested jawab</h3><Out text={sug} /></>}
      {nts && <><h3 className="text-sm font-semibold">AI Notes</h3><Out text={nts} /></>}
      <Out error={err} />
    </section>
  );
}

export default function Page() {
  const [tab, setTab] = useState('mock');
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Interview Coach</h1>
        <p className="text-slate-600 dark:text-slate-400">Practice karo, aur calls mein khule tareeke se AI ki madad lo.</p>
      </header>

      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
        Ye tool khula hai. Agar call ya interview mein dusre log hain to unhe bata do ki aap AI assistant use kar rahe ho.
        Jahan AI mana hai (jaise proctored exam ya interview) wahan ise use mat karo.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="role">Role ya company</label>
          <input id="role" className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Jaise: Software Developer" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="notes">Resume ya notes (optional)</label>
          <textarea id="notes" rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-800" role="tablist">
        {[['mock', 'Mock Interview'], ['live', 'Live Assistant']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-md py-2 text-sm font-medium ${tab === k ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-600 dark:text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'mock' ? <Mock role={role} notes={notes} /> : <Live role={role} notes={notes} />}
    </main>
  );
}

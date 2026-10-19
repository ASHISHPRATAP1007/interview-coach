'use client';
import { useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://interview-coach-api-cpxr.onrender.com';

async function api(path, body) {
  let res;
  try {
    res = await fetch(`${API}/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`API tak nahi pahunch paya (${API}). Neeche "Connection check" dabao.`);
  }
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

function encodeWav(f32, rate) {
  const buf = new ArrayBuffer(44 + f32.length * 2);
  const v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + f32.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, f32.length * 2, true);
  let o = 44;
  for (let i = 0; i < f32.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let b = '';
  for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(b);
}

function downsample(data, from, to) {
  if (from <= to) return data;
  const ratio = from / to;
  const n = Math.floor(data.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.floor(i * ratio), e = Math.max(s + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = s; j < e; j++) sum += data[j];
    out[i] = sum / (e - s);
  }
  return out;
}

const QUESTION_RE = /\?|\b(kya|kaise|kyun|kyon|kab|kaun|kitna|what|how|why|when|who|which|tell me|explain|describe|walk me)\b/i;

function Live({ role, notes }) {
  const [transcript, setTranscript] = useState('');
  const [auto, setAuto] = useState(true);
  const [sug, setSug] = useState('');
  const [nts, setNts] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tabOn, setTabOn] = useState(false);
  const [tabMsg, setTabMsg] = useState('');
  const tRef = useRef('');
  const autoRef = useRef(true);
  const rnRef = useRef({ role, notes });
  const inflight = useRef(false);
  const tab = useRef(null);
  autoRef.current = auto;
  rnRef.current = { role, notes };

  const set = (v) => { tRef.current = v; setTranscript(v); };
  const append = (who, t) => {
    const next = (tRef.current ? tRef.current + '\n' : '') + who + ': ' + t;
    set(next);
    return next;
  };

  async function call(path, setter, text) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true); setErr('');
    try { setter(await api(path, { ...rnRef.current, transcript: text })); }
    catch (e) { setErr(e.message); }
    inflight.current = false;
    setBusy(false);
  }

  // Aapki apni awaaz (mic)
  const speech = useSpeech((t) => {
    const next = append('Aap', t);
    if (autoRef.current && QUESTION_RE.test(t)) call('suggest', setSug, next);
  });

  // Dusre vyakti ki awaaz (browser tab ki audio)
  async function sendChunk(all, rate) {
    const data = downsample(all, rate, 16000);
    let sum = 0;
    for (let i = 0; i < data.length; i += 8) sum += data[i] * data[i];
    if (Math.sqrt(sum / (data.length / 8)) < 0.004) return; // khamoshi, skip
    try {
      const wav = encodeWav(data, Math.min(rate, 16000));
      const text = await api('transcribe', { audio: toBase64(wav), mime: 'audio/wav' });
      if (text && text.trim()) {
        const next = append('Interviewer', text.trim());
        if (autoRef.current) call('suggest', setSug, next);
      }
    } catch (e) { setTabMsg(e.message); }
  }

  function stopTab() {
    const t = tab.current;
    if (!t) return;
    try { t.proc.disconnect(); t.src.disconnect(); t.ctx.close(); } catch (e) {}
    t.stream.getTracks().forEach((x) => x.stop());
    tab.current = null;
    setTabOn(false);
  }

  async function startTab() {
    if (tabOn) { stopTab(); return; }
    setTabMsg('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        setTabMsg('Ye browser tab ki awaaz capture nahi kar sakta. Computer par Chrome ya Edge use karo.');
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const at = stream.getAudioTracks();
      if (!at.length) {
        stream.getTracks().forEach((x) => x.stop());
        setTabMsg('Awaaz share nahi hui. Dobara try karo, aur "Also share tab audio" tick karna na bhulo.');
        return;
      }
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(new MediaStream(at));
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      let bufs = [], len = 0;
      const need = ctx.sampleRate * 10; // har 10 second ka tukda
      proc.onaudioprocess = (e) => {
        const c = new Float32Array(e.inputBuffer.getChannelData(0));
        bufs.push(c); len += c.length;
        if (len >= need) {
          const all = new Float32Array(len);
          let o = 0;
          for (const b of bufs) { all.set(b, o); o += b.length; }
          bufs = []; len = 0;
          sendChunk(all, ctx.sampleRate);
        }
      };
      src.connect(proc);
      proc.connect(ctx.destination);
      stream.getVideoTracks().forEach((v) => { v.onended = stopTab; });
      tab.current = { stream, ctx, proc, src };
      setTabOn(true);
    } catch (e) {
      setTabMsg('Tab share shuru nahi hua. Permission dena zaroori hai.');
    }
  }

  useEffect(() => () => stopTab(), []);

  return (
    <section className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="font-medium">Dusre vyakti ki awaaz kaise pakdein</p>
        <ol className="ml-5 list-decimal space-y-1 text-slate-600 dark:text-slate-400">
          <li>Computer par Chrome ya Edge mein call (Meet, Zoom web, Teams web) ek tab mein kholo.</li>
          <li>Neeche <b>Tab ki awaaz suno</b> dabao, wo tab chuno, aur <b>Also share tab audio</b> tick karo.</li>
          <li>Interviewer jo bolega wo transcript mein "Interviewer:" ke saath aayega, aur AI jawab suggest karega.</li>
        </ol>
        <p className="mt-1 text-slate-500">Browser upar sharing ka nishaan dikhata rehta hai. Call mein sabko batao ki aap AI assistant use kar rahe ho.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnCls} onClick={startTab}>{tabOn ? 'Tab sunna rokho' : 'Tab ki awaaz suno'}</button>
        <button className={btn2Cls} onClick={speech.toggle}>{speech.on ? 'Mic rokho' : 'Meri awaaz (mic) suno'}</button>
        <button className={btn2Cls} disabled={busy || !transcript.trim()} onClick={() => call('suggest', setSug, transcript)}>Jawab suggest karo</button>
        <button className={btn2Cls} disabled={busy || !transcript.trim()} onClick={() => call('notes', setNts, transcript)}>Notes banao</button>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto answer
        </label>
      </div>
      <p className="text-sm text-slate-500">
        {tabOn ? 'Tab ki awaaz sun raha hoon…' : 'Tab band hai.'} {speech.on ? 'Mic chalu hai.' : ''}
      </p>
      {tabMsg && <p className="text-sm text-red-600">{tabMsg}</p>}
      {speech.error && <p className="text-sm text-red-600">{speech.error}</p>}
      <label className="block text-sm font-medium" htmlFor="tr">Transcript (type ya paste bhi kar sakte ho)</label>
      <textarea id="tr" rows={7} className={inputCls} value={transcript} onChange={(e) => set(e.target.value)}
        placeholder={'Jaise:\nInterviewer: Apne baare mein batao?'} />
      {busy && <p className="text-sm text-slate-500">Soch raha hoon…</p>}
      {sug && <><h3 className="text-sm font-semibold">Suggested jawab</h3><Out text={sug} /></>}
      {nts && <><h3 className="text-sm font-semibold">AI Notes</h3><Out text={nts} /></>}
      <Out error={err} />
    </section>
  );
}

function Status() {
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setOut('Check ho raha hai… (free server ko jagne mein 60 second lag sakte hain)');
    const lines = [`API ka URL: ${API}`];
    try {
      const r = await fetch(`${API}/health`);
      const j = await r.json();
      lines.push('Server: chal raha hai');
      lines.push(`Gemini key: ${j.key_set ? 'set hai' : 'SET NAHI HAI (Render mein GEMINI_API_KEY daalo)'}`);
      lines.push(`Model: ${j.model}`);
      try {
        const r2 = await fetch(`${API}/api/test`);
        const j2 = await r2.json().catch(() => ({}));
        lines.push(r2.ok ? `AI test: theek (${j2.text})` : `AI test fail: ${j2.detail || r2.status}`);
      } catch (e) {
        lines.push('AI test: request block hui (CORS). API mein FRONTEND_URL check karo.');
      }
    } catch (e) {
      lines.push('Server tak nahi pahunch paya.');
      if (API.includes('localhost')) {
        lines.push('Wajah: web service ko API ka URL nahi mila. Render mein NEXT_PUBLIC_API_URL set karo aur web service dobara deploy karo.');
      } else {
        lines.push('Wajah: URL galat hai, ya API service so rahi hai (thodi der ruk kar dobara dabao), ya request block ho rahi hai.');
      }
    }
    setOut(lines.join('\n'));
    setBusy(false);
  }

  return (
    <details className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
      <summary className="cursor-pointer font-medium">Kuch kaam nahi kar raha? Connection check</summary>
      <div className="mt-2 space-y-2">
        <button className={btn2Cls} onClick={check} disabled={busy}>Connection check</button>
        {out && <pre className="whitespace-pre-wrap break-words rounded bg-slate-100 p-2 dark:bg-slate-900">{out}</pre>}
      </div>
    </details>
  );
}

export default function Page() {
  const [tab, setTab] = useState('mock');
  const [p, setP] = useState({ name: '', role: '', exp: '', skills: '', extra: '' });

  useEffect(() => {
    try { const s = localStorage.getItem('ic_profile'); if (s) setP(JSON.parse(s)); } catch (e) {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('ic_profile', JSON.stringify(p)); } catch (e) {}
  }, [p]);

  const upd = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const role = p.role;
  const notes = [
    p.name && `Naam: ${p.name}`,
    p.exp && `Experience: ${p.exp}`,
    p.skills && `Skills: ${p.skills}`,
    p.extra && `Resume ya notes: ${p.extra}`,
  ].filter(Boolean).join('\n');

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

      <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <p className="mb-2 text-sm font-medium">Aapki basic details (AI inhe dekhkar aapke hisaab se jawab deta hai)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm" htmlFor="name">Naam</label>
            <input id="name" className={inputCls} value={p.name} onChange={upd('name')} />
          </div>
          <div>
            <label className="mb-1 block text-sm" htmlFor="role">Role ya company</label>
            <input id="role" className={inputCls} value={p.role} onChange={upd('role')} placeholder="Jaise: Software Developer" />
          </div>
          <div>
            <label className="mb-1 block text-sm" htmlFor="exp">Experience</label>
            <input id="exp" className={inputCls} value={p.exp} onChange={upd('exp')} placeholder="Jaise: Fresher ya 2 saal" />
          </div>
          <div>
            <label className="mb-1 block text-sm" htmlFor="skills">Skills</label>
            <input id="skills" className={inputCls} value={p.skills} onChange={upd('skills')} placeholder="Jaise: Python, React" />
          </div>
        </div>
        <label className="mb-1 mt-3 block text-sm" htmlFor="extra">Resume ya projects (optional)</label>
        <textarea id="extra" rows={3} className={inputCls} value={p.extra} onChange={upd('extra')} />
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

      <Status />
    </main>
  );
}

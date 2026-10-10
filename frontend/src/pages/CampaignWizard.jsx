// Wizard kampanye blast, 5 langkah:
// 1 Nama → 2 Audiens → 3 Template → 4 Mapping variabel → 5 Jadwal & kirim
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Rocket, CalendarClock, Zap, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { useAccounts } from '../context/AccountContext.jsx';
import { extractVars, fmtNum } from '../lib/format.js';
import { ErrorNote, Spinner } from '../components/ui.jsx';
import TemplateSelector from '../components/TemplateSelector.jsx';
import TemplatePreview from '../components/TemplatePreview.jsx';

const STEPS = ['Nama', 'Audiens', 'Template', 'Variabel', 'Pengiriman'];
const CONTACT_FIELDS = [['name', 'Nama kontak'], ['phone', 'Nomor HP'], ['email', 'Email']];
const DELAYS = [[500, '0,5 detik (cepat)'], [700, '0,7 detik (disarankan)'], [1000, '1 detik (hati-hati)'], [2000, '2 detik (paling aman)']];

/** Sama dengan resolveValue di server — dipakai untuk pratinjau dengan kontak contoh. */
function resolve(spec, contact) {
  let v = '';
  if (spec?.type === 'field') v = contact?.[spec.value] ?? '';
  else if (spec?.type === 'variable') v = contact?.variables?.[spec.value] ?? '';
  else if (spec?.type === 'static') v = spec.value ?? '';
  return String(v).trim() || spec?.fallback || '-';
}

/** Satu baris pemetaan: {{n}} → sumber data */
function MappingRow({ n, spec, onChange, varKeys }) {
  const s = spec || { type: 'field', value: 'name' };
  const pick = (type) => onChange({ type, value: type === 'field' ? 'name' : '', fallback: s.fallback });
  return (
    <div className="grid items-center gap-2 rounded-md border border-line p-3 sm:grid-cols-[4rem_1fr_1fr_1fr]">
      <span className="font-mono text-sm font-medium">{`{{${n}}}`}</span>
      <select className="input" value={s.type} onChange={(e) => pick(e.target.value)} aria-label={`Sumber variabel ${n}`}>
        <option value="field">Data kontak</option><option value="variable">Custom variable</option><option value="static">Teks tetap</option></select>
      {s.type === 'field' && <select className="input" value={s.value} onChange={(e) => onChange({ ...s, value: e.target.value })}>{CONTACT_FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
      {s.type === 'variable' && (varKeys.length
        ? <select className="input" value={s.value} onChange={(e) => onChange({ ...s, value: e.target.value })}><option value="">Pilih variabel…</option>{varKeys.map((k) => <option key={k}>{k}</option>)}</select>
        : <input className="input" placeholder="nama_variabel" value={s.value} onChange={(e) => onChange({ ...s, value: e.target.value })} />)}
      {s.type === 'static' && <input className="input" placeholder="Teks yang sama untuk semua" value={s.value} onChange={(e) => onChange({ ...s, value: e.target.value })} />}
      <input className="input" placeholder="Jika kosong, pakai…" value={s.fallback || ''} onChange={(e) => onChange({ ...s, fallback: e.target.value })} aria-label={`Nilai cadangan variabel ${n}`} />
    </div>
  );
}

export default function CampaignWizard() {
  const nav = useNavigate();
  const { active, activeId } = useAccounts();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    name: '', tags: [], tag_match: 'any', template: null, mapping: { body: {}, header: {} },
    header_media_url: '', send_mode: 'now', scheduled_at: '', delay_ms: 700,
  });
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const tagList = usePolling(() => api('/contacts/tags'), []);
  const varKeys = usePolling(() => api('/contacts/variable-keys'), []);
  const sample = usePolling(() => api('/contacts', { params: { tag: f.tags[0], limit: 1 } }), [f.tags[0]]);

  // Hitung jumlah penerima setiap kali pilihan audiens berubah (debounce 300ms)
  useEffect(() => {
    setCount(null);
    const t = setTimeout(() => api('/campaigns/audience-count', { method: 'POST', body: { tags: f.tags, tag_match: f.tag_match } }).then((r) => setCount(r.count)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [f.tags, f.tag_match]);

  const tpl = f.template;
  const bodyVars = useMemo(() => extractVars(tpl?.body), [tpl]);
  const headerVars = useMemo(() => (tpl?.header_type === 'TEXT' ? extractVars(tpl.header_text) : []), [tpl]);
  const needsMedia = ['IMAGE', 'DOCUMENT', 'VIDEO'].includes(tpl?.header_type);
  const sampleContact = sample.data?.data?.[0];

  const setMap = (part, n, spec) => set({ mapping: { ...f.mapping, [part]: { ...f.mapping[part], [n]: spec } } });
  // Saat template berganti, siapkan pemetaan default: {{1}} → nama kontak, sisanya kosong (harus diisi)
  const chooseTemplate = (t) => {
    const body = {}; extractVars(t.body).forEach((n, i) => { body[n] = i === 0 ? { type: 'field', value: 'name', fallback: 'Kak' } : { type: 'static', value: '' }; });
    const header = {}; if (t.header_type === 'TEXT') extractVars(t.header_text).forEach((n) => { header[n] = { type: 'static', value: '' }; });
    set({ template: t, mapping: { body, header }, header_media_url: '' });
  };

  const previewValues = useMemo(() => ({
    body: Object.fromEntries(bodyVars.map((n) => [n, resolve(f.mapping.body[n], sampleContact)])),
    header: Object.fromEntries(headerVars.map((n) => [n, resolve(f.mapping.header[n], sampleContact)])),
  }), [bodyVars, headerVars, f.mapping, sampleContact]);

  // Validasi per langkah → tombol "Lanjut" aktif hanya bila sudah valid
  const mappingOk = [...bodyVars.map((n) => f.mapping.body[n]), ...headerVars.map((n) => f.mapping.header[n])].every((s) => s && (s.type === 'field' || s.value));
  const scheduleOk = f.send_mode === 'now' || (f.scheduled_at && new Date(f.scheduled_at) > new Date(Date.now() + 60000));
  const valid = [
    f.name.trim().length > 2,
    count > 0,
    !!tpl,
    mappingOk && (!needsMedia || /^https:\/\//.test(f.header_media_url)),
    scheduleOk,
  ];

  const launch = async () => {
    setBusy(true); setError(null);
    try {
      const c = await api('/campaigns', { method: 'POST', body: {
        name: f.name, account_id: activeId, template_id: tpl.id, target_tags: f.tags, tag_match: f.tag_match,
        variable_mapping: f.mapping, header_media_url: f.header_media_url || undefined, delay_ms: f.delay_ms,
        send_mode: f.send_mode, scheduled_at: f.send_mode === 'schedule' ? new Date(f.scheduled_at).toISOString() : undefined,
      } });
      nav(`/campaigns/${c.id}`);
    } catch (e) { setError(e); setBusy(false); }
  };

  const minutes = count ? Math.ceil((count * (f.delay_ms * 1.15)) / 60000) : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold">Kampanye baru</h1>
      <p className="mb-6 text-sm text-ink-600">Dikirim dari <b>{active?.label}</b> ({active?.display_phone_number})</p>

      {/* Stepper — memang urutan, jadi bernomor */}
      <ol className="mb-6 flex items-center gap-1 overflow-x-auto" aria-label="Langkah">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2 whitespace-nowrap">
            <button disabled={i > step} onClick={() => setStep(i)} className="flex items-center gap-2 text-sm" aria-current={i === step ? 'step' : undefined}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${i < step ? 'bg-wa-600 text-white' : i === step ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-line'}`}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</span>
              <span className={i === step ? 'font-semibold' : 'text-ink-600'}>{s}</span></button>
            {i < STEPS.length - 1 && <span className="h-px min-w-[1rem] flex-1 bg-line" />}
          </li>))}
      </ol>

      <div className="panel p-5 sm:p-6">
        {/* ---- 1. Nama ---- */}
        {step === 0 && (
          <div className="max-w-lg"><label className="label" htmlFor="cn">Nama kampanye</label>
            <input id="cn" className="input" autoFocus placeholder="mis. Promo Gajian Oktober" value={f.name} onChange={(e) => set({ name: e.target.value })} />
            <p className="hint">Hanya untuk internal Anda, tidak terlihat oleh penerima.</p></div>)}

        {/* ---- 2. Audiens ---- */}
        {step === 1 && (
          <div>
            <h2 className="mb-1 text-lg font-bold">Siapa yang menerima?</h2>
            <p className="mb-3 text-sm text-ink-600">Pilih satu atau lebih tag. Tanpa tag, pesan dikirim ke <b>semua</b> kontak yang opt-in.</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {tagList.data?.map((t) => { const on = f.tags.includes(t.tag); return (
                <button key={t.tag} type="button" aria-pressed={on} onClick={() => set({ tags: on ? f.tags.filter((x) => x !== t.tag) : [...f.tags, t.tag] })}
                  className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-wa-600 bg-wa-600 text-white' : 'border-line bg-white hover:bg-surface'}`}>#{t.tag} <span className={on ? 'text-wa-100' : 'text-ink-600'}>{fmtNum(t.count)}</span></button>); })}
              {tagList.data?.length === 0 && <p className="text-sm text-ink-600">Belum ada tag. Tambahkan tag lewat menu Kontak.</p>}
            </div>
            {f.tags.length > 1 && (
              <div className="mb-4 flex gap-4 text-sm">
                {[['any', 'Punya salah satu tag'], ['all', 'Punya semua tag']].map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2"><input type="radio" name="match" checked={f.tag_match === k} onChange={() => set({ tag_match: k })} />{l}</label>))}
              </div>)}
            <div className="rounded-md bg-wa-50 px-4 py-3"><span className="font-display text-3xl font-bold">{count === null ? <Spinner /> : fmtNum(count)}</span> <span className="text-sm text-ink-800">penerima (hanya kontak opt-in)</span></div>
          </div>)}

        {/* ---- 3. Template ---- */}
        {step === 2 && (<div><h2 className="mb-3 text-lg font-bold">Pilih template yang disetujui</h2>
          <TemplateSelector accountId={activeId} value={tpl} onSelect={chooseTemplate} /></div>)}

        {/* ---- 4. Mapping variabel ---- */}
        {step === 3 && tpl && (
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-4">
              <h2 className="text-lg font-bold">Isi variabel template</h2>
              {needsMedia && (
                <div><label className="label">URL {tpl.header_type === 'IMAGE' ? 'gambar' : 'file'} header</label>
                  <input className="input" type="url" placeholder="https://…" value={f.header_media_url} onChange={(e) => set({ header_media_url: e.target.value })} />
                  <p className="hint">Harus berupa link publik HTTPS yang bisa diunduh Meta.</p></div>)}
              {headerVars.length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Header</p>{headerVars.map((n) => <MappingRow key={n} n={n} spec={f.mapping.header[n]} varKeys={varKeys.data || []} onChange={(s) => setMap('header', n, s)} />)}</div>}
              {bodyVars.length > 0 ? (
                <div className="space-y-2"><p className="text-sm font-medium">Isi pesan</p>{bodyVars.map((n) => <MappingRow key={n} n={n} spec={f.mapping.body[n]} varKeys={varKeys.data || []} onChange={(s) => setMap('body', n, s)} />)}</div>
              ) : <p className="rounded-md bg-surface p-3 text-sm text-ink-600">Template ini tidak memiliki variabel. Anda bisa langsung lanjut.</p>}
            </div>
            <div><p className="label">Pratinjau{sampleContact ? ` (contoh: ${sampleContact.name || sampleContact.phone})` : ''}</p>
              <TemplatePreview {...tpl} values={previewValues} mediaUrl={f.header_media_url} /></div>
          </div>)}

        {/* ---- 5. Pengiriman ---- */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {[['now', Zap, 'Kirim sekarang', 'Antrian langsung berjalan setelah dikonfirmasi.'], ['schedule', CalendarClock, 'Jadwalkan', 'Pilih tanggal dan jam pengiriman.']].map(([k, Icon, t, d]) => (
                <button key={k} type="button" aria-pressed={f.send_mode === k} onClick={() => set({ send_mode: k })}
                  className={`flex gap-3 rounded-lg border p-4 text-left ${f.send_mode === k ? 'border-wa-500 bg-wa-50 ring-1 ring-wa-500' : 'border-line hover:border-ink-300'}`}>
                  <Icon className="mt-0.5 h-5 w-5 text-wa-700" /><span><span className="block font-medium">{t}</span><span className="text-sm text-ink-600">{d}</span></span></button>))}
            </div>
            {f.send_mode === 'schedule' && (
              <div className="max-w-xs"><label className="label" htmlFor="sa">Waktu kirim</label>
                <input id="sa" type="datetime-local" className="input" value={f.scheduled_at} onChange={(e) => set({ scheduled_at: e.target.value })} />
                <p className="hint">Mengikuti zona waktu perangkat Anda.</p></div>)}
            <div className="max-w-xs"><label className="label" htmlFor="dl">Jeda antar pesan</label>
              <select id="dl" className="input" value={f.delay_ms} onChange={(e) => set({ delay_ms: Number(e.target.value) })}>{DELAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <p className="hint">Jeda lebih panjang mengurangi risiko dianggap spam dan terkena rate limit.</p></div>

            <dl className="divide-y divide-line rounded-md border border-line text-sm">
              {[['Kampanye', f.name], ['Nomor pengirim', active?.display_phone_number], ['Audiens', f.tags.length ? f.tags.map((t) => `#${t}`).join(f.tag_match === 'all' ? ' + ' : ' / ') : 'Semua kontak opt-in'],
                ['Penerima', fmtNum(count)], ['Template', tpl?.name], ['Perkiraan durasi', `± ${minutes < 1 ? '<1' : fmtNum(minutes)} menit`]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-ink-600">{k}</dt><dd className="text-right font-medium">{v}</dd></div>))}
            </dl>
            {tpl?.category === 'MARKETING' && (
              <p className="flex gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Pesan marketing hanya boleh dikirim ke pelanggan yang sudah memberi persetujuan. Terlalu banyak blokir/laporan akan menurunkan Quality Rating dan batas harian nomor Anda.</p>)}
            <ErrorNote error={error} />
          </div>)}
      </div>

      <div className="mt-4 flex justify-between">
        <button className="btn-ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" />Kembali</button>
        {step < STEPS.length - 1
          ? <button className="btn-dark" disabled={!valid[step]} onClick={() => setStep(step + 1)}>Lanjut<ArrowRight className="h-4 w-4" /></button>
          : <button className="btn-primary" disabled={!valid[4] || busy} onClick={launch}>{busy ? <Spinner /> : <Rocket className="h-4 w-4" />}{f.send_mode === 'now' ? `Kirim ke ${fmtNum(count)} penerima` : 'Jadwalkan kampanye'}</button>}
      </div>
    </div>
  );
}

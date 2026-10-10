// Form pembuat template baru → dikirim ke Meta untuk di-review.
import { useState } from 'react';
import { Plus, Trash2, Info } from 'lucide-react';
import { api } from '../lib/api.js';
import { extractVars } from '../lib/format.js';
import { ErrorNote, Modal, Spinner } from './ui.jsx';
import TemplatePreview from './TemplatePreview.jsx';

const LANGS = [['id', 'Indonesia'], ['en', 'English'], ['en_US', 'English (US)']];
const BTN_TYPES = [['QUICK_REPLY', 'Quick Reply'], ['URL', 'Link (URL)'], ['PHONE_NUMBER', 'Telepon']];

export default function TemplateForm({ accountId, onClose, onSaved }) {
  const [f, setF] = useState({
    name: '', language: 'id', category: 'MARKETING',
    header: { type: 'NONE', text: '', sample_url: '' }, body: '', body_examples: [], footer: '', buttons: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const vars = extractVars(f.body);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const setHeader = (patch) => setF((p) => ({ ...p, header: { ...p.header, ...patch } }));
  const setBtn = (i, patch) => set({ buttons: f.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  /** Sisipkan variabel berikutnya ({{1}}, {{2}}, …) di akhir teks body. */
  const addVar = () => set({ body: `${f.body}{{${(vars.at(-1) || 0) + 1}}}` });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api('/templates', { method: 'POST', body: { ...f, account_id: accountId } });
      onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const values = { body: Object.fromEntries(vars.map((n, i) => [n, f.body_examples[i] || `contoh${n}`])), header: { 1: f.header.example || 'contoh' } };

  return (
    <Modal title="Buat template baru" onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <ErrorNote error={error} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3"><label className="label">Nama template</label>
              <input className="input font-mono" required pattern="[a-z0-9_]+" placeholder="promo_akhir_tahun" value={f.name}
                onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
              <p className="hint">Huruf kecil, angka, dan underscore. Tidak bisa diubah setelah dibuat.</p></div>
            <div><label className="label">Kategori</label>
              <select className="input" value={f.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="MARKETING">Marketing</option><option value="UTILITY">Utility</option><option value="AUTHENTICATION">Authentication</option></select></div>
            <div><label className="label">Bahasa</label>
              <select className="input" value={f.language} onChange={(e) => set({ language: e.target.value })}>{LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          </div>

          <div><label className="label">Header (opsional)</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[['NONE', 'Tanpa header'], ['TEXT', 'Teks'], ['IMAGE', 'Gambar'], ['DOCUMENT', 'PDF']].map(([k, l]) => (
                <button type="button" key={k} onClick={() => setHeader({ type: k })} className={`rounded-full px-3 py-1 text-sm ${f.header.type === k ? 'bg-ink-900 text-white' : 'border border-line bg-white hover:bg-surface'}`}>{l}</button>))}
            </div>
            {f.header.type === 'TEXT' && <input className="input" maxLength={60} placeholder="Judul singkat (maks. 60 karakter, boleh 1 variabel {{1}})" value={f.header.text} onChange={(e) => setHeader({ text: e.target.value })} />}
            {['IMAGE', 'DOCUMENT'].includes(f.header.type) && (<>
              <input className="input" type="url" required placeholder="https://… contoh file (untuk review Meta)" value={f.header.sample_url} onChange={(e) => setHeader({ sample_url: e.target.value })} />
              <p className="hint">Ini hanya contoh untuk proses review. File sebenarnya diisi saat membuat kampanye.</p></>)}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between"><label className="label !mb-0" htmlFor="body">Isi pesan</label>
              <button type="button" className="text-sm font-medium text-wa-700 hover:underline" onClick={addVar}>+ Variabel</button></div>
            <textarea id="body" className="input min-h-[8rem]" required maxLength={1024} placeholder={'Halo {{1}}, promo spesial untuk Anda…'} value={f.body} onChange={(e) => set({ body: e.target.value })} />
            <p className="hint">{f.body.length}/1024. Gunakan {'{{1}}'}, {'{{2}}'} berurutan; jangan taruh variabel di awal/akhir pesan atau berdampingan.</p>
            {vars.length > 0 && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{vars.map((n, i) => (
                <input key={n} className="input" required placeholder={`Contoh nilai untuk {{${n}}}`} value={f.body_examples[i] || ''}
                  onChange={(e) => { const a = [...f.body_examples]; a[i] = e.target.value; set({ body_examples: a }); }} />))}</div>)}
          </div>

          <div><label className="label">Footer (opsional)</label>
            <input className="input" maxLength={60} placeholder="mis. Balas STOP untuk berhenti berlangganan" value={f.footer} onChange={(e) => set({ footer: e.target.value })} /></div>

          <div>
            <div className="mb-1 flex items-center justify-between"><label className="label !mb-0">Tombol (opsional)</label>
              {f.buttons.length < 3 && <button type="button" className="text-sm font-medium text-wa-700 hover:underline" onClick={() => set({ buttons: [...f.buttons, { type: 'QUICK_REPLY', text: '' }] })}><Plus className="inline h-3.5 w-3.5" /> Tambah tombol</button>}</div>
            <div className="space-y-2">{f.buttons.map((b, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2 rounded-md border border-line p-2">
                <select className="input w-36" value={b.type} onChange={(e) => setBtn(i, { type: e.target.value })}>{BTN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <input className="input w-40 flex-1" required maxLength={25} placeholder="Teks tombol" value={b.text} onChange={(e) => setBtn(i, { text: e.target.value })} />
                {b.type === 'URL' && <input className="input flex-1" type="url" required placeholder="https://…" value={b.url || ''} onChange={(e) => setBtn(i, { url: e.target.value })} />}
                {b.type === 'PHONE_NUMBER' && <input className="input flex-1" required placeholder="+62812…" value={b.phone_number || ''} onChange={(e) => setBtn(i, { phone_number: e.target.value })} />}
                <button type="button" className="btn-ghost" aria-label="Hapus tombol" onClick={() => set({ buttons: f.buttons.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
              </div>))}</div>
          </div>

          <p className="flex gap-2 rounded-md bg-sky-50 p-3 text-sm text-sky-900"><Info className="mt-0.5 h-4 w-4 shrink-0" />Meta biasanya meninjau template dalam beberapa menit hingga 24 jam. Gunakan “Sinkronkan dari Meta” untuk melihat statusnya.</p>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
            <button className="btn-primary" disabled={busy}>{busy && <Spinner />}Kirim ke Meta untuk review</button></div>
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start"><p className="label">Pratinjau</p>
          <TemplatePreview header_type={f.header.type} header_text={f.header.text} body={f.body} footer={f.footer} buttons={f.buttons} values={values} mediaUrl={f.header.sample_url} /></div>
      </form>
    </Modal>
  );
}

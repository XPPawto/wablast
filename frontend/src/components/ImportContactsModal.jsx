// Import kontak: unggah CSV/Excel → pemetaan kolom → pratinjau → kirim per batch ke server.
// Parsing dilakukan di browser (PapaParse + SheetJS) sehingga server hanya menerima baris yang sudah rapi.
import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { fmtNum } from '../lib/format.js';
import { ErrorNote, Modal, ProgressBar, Spinner, TagInput } from './ui.jsx';

const TARGETS = [
  { key: 'phone', label: 'Nomor HP (wajib)' },
  { key: 'name', label: 'Nama' },
  { key: 'email', label: 'Email' },
  { key: 'tags', label: 'Tag / Kategori' },
];
// Tebakan otomatis pemetaan kolom berdasarkan nama header
const GUESS = {
  phone: /(phone|hp|telp|telepon|whatsapp|wa|nomor|no\.?)/i, name: /(nama|name)/i,
  email: /(mail)/i, tags: /(tag|kategori|category|segmen|label)/i,
};
const BATCH = 500;

async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv' || ext === 'txt') {
    return new Promise((resolve, reject) =>
      Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => resolve(r.data), error: reject }));
  }
  const wb = XLSX.read(await file.arrayBuffer());
  // raw:false → nomor HP tetap berupa teks, tidak berubah jadi notasi ilmiah
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
}

export default function ImportContactsModal({ onClose, onDone }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState({});              // { phone:'Kolom A', name:'Kolom B', ... }
  const [extra, setExtra] = useState({});          // kolom lain yang dijadikan custom variable { 'Kolom C': 'kota' }
  const [autoTags, setAutoTags] = useState([]);
  const [progress, setProgress] = useState(null);  // null | 0..100
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const headers = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);
  const unmapped = headers.filter((h) => !Object.values(map).includes(h));

  const onFile = async (file) => {
    if (!file) return;
    setError(null);
    try {
      const data = await parseFile(file);
      if (!data.length) throw new Error('File kosong atau header tidak terbaca.');
      const cols = Object.keys(data[0]);
      const guess = {};
      for (const t of TARGETS) guess[t.key] = cols.find((c) => GUESS[t.key].test(c) && !Object.values(guess).includes(c)) || '';
      setRows(data); setMap(guess); setFileName(file.name);
    } catch (e) { setError(e); }
  };

  /** Ubah baris mentah → baris rapi sesuai pemetaan. */
  const shaped = useMemo(() => rows.map((r, i) => ({
    _row: i + 2, // +2: baris 1 = header
    phone: r[map.phone] ?? '',
    name: r[map.name] ?? '',
    email: r[map.email] ?? '',
    tags: map.tags ? String(r[map.tags] ?? '').split(/[;,|]/).map((s) => s.trim()).filter(Boolean) : [],
    variables: Object.fromEntries(Object.entries(extra).filter(([, key]) => key).map(([col, key]) => [key, r[col]]).filter(([, v]) => v !== '' && v != null)),
  })), [rows, map, extra]);

  const run = async () => {
    setError(null); setProgress(0);
    const total = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    try {
      for (let i = 0; i < shaped.length; i += BATCH) {
        const r = await api('/contacts/import', { method: 'POST', body: { rows: shaped.slice(i, i + BATCH), auto_tags: autoTags } });
        total.inserted += r.inserted; total.updated += r.updated; total.skipped += r.skipped; total.errors.push(...r.errors);
        setProgress(Math.round(((i + BATCH) / shaped.length) * 100));
      }
      setResult(total); onDone();
    } catch (e) { setError(e); } finally { setProgress(null); }
  };

  // ---- Tahap 3: hasil ----
  if (result) return (
    <Modal title="Import selesai" onClose={onClose}>
      <div className="flex items-start gap-3"><CheckCircle2 className="h-6 w-6 text-wa-600" />
        <div><p className="font-medium">{fmtNum(result.inserted)} kontak baru, {fmtNum(result.updated)} diperbarui, {fmtNum(result.skipped)} dilewati.</p>
          <p className="text-sm text-ink-600">Nomor yang sudah ada digabung: tag ditambahkan, data lama tidak ditimpa dengan kosong.</p></div></div>
      {result.errors.length > 0 && (
        <div className="mt-4 max-h-48 overflow-y-auto rounded-md border border-line bg-surface p-3 text-sm">
          {result.errors.slice(0, 50).map((e, i) => <p key={i}>Baris {e.row}: {e.reason}</p>)}
          {result.errors.length > 50 && <p className="text-ink-600">…dan {result.errors.length - 50} lainnya</p>}
        </div>)}
      <div className="mt-5 text-right"><button className="btn-primary" onClick={onClose}>Selesai</button></div>
    </Modal>
  );

  return (
    <Modal title="Import kontak" onClose={onClose} wide>
      <div className="space-y-5">
        <ErrorNote error={error} />
        {/* Tahap 1: unggah */}
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-8 text-center hover:border-wa-500 hover:bg-wa-50">
          <UploadCloud className="h-8 w-8 text-ink-600" />
          <span className="font-medium">{fileName || 'Pilih file CSV atau Excel (.xlsx)'}</span>
          <span className="text-xs text-ink-600">Baris pertama harus berisi nama kolom. Nomor boleh berformat 0812…, +62812…, atau 62812…</span>
          <input type="file" accept=".csv,.txt,.xlsx,.xls" className="sr-only" onChange={(e) => onFile(e.target.files[0])} />
        </label>

        {rows.length > 0 && (
          <>
            {/* Tahap 2: pemetaan kolom */}
            <div>
              <h3 className="mb-2 text-base font-bold">Pemetaan kolom <span className="font-normal text-ink-600">({fmtNum(rows.length)} baris)</span></h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {TARGETS.map((t) => (
                  <div key={t.key}><label className="label">{t.label}</label>
                    <select className="input" value={map[t.key] || ''} onChange={(e) => setMap({ ...map, [t.key]: e.target.value })}>
                      <option value="">— Jangan impor —</option>
                      {headers.map((h) => <option key={h}>{h}</option>)}
                    </select></div>
                ))}
              </div>
            </div>

            {unmapped.length > 0 && (
              <div>
                <h3 className="mb-1 text-base font-bold">Custom variable</h3>
                <p className="mb-2 text-sm text-ink-600">Kolom lain bisa disimpan sebagai variabel untuk dipakai di isi template (mis. kota, nomor order). Isi nama variabelnya, atau kosongkan untuk melewati.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {unmapped.map((col) => (
                    <div key={col} className="flex items-center gap-2"><span className="w-1/2 truncate text-sm" title={col}>{col}</span>
                      <input className="input" placeholder="nama_variabel" value={extra[col] || ''}
                        onChange={(e) => setExtra({ ...extra, [col]: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></div>
                  ))}
                </div>
              </div>
            )}

            <div><label className="label">Tag otomatis untuk semua kontak di file ini</label>
              <TagInput value={autoTags} onChange={setAutoTags} placeholder="mis. vip, leads, customer-lama" />
              <p className="hint">Ditambahkan ke tag dari file (bila ada). Berguna untuk menandai asal daftar.</p></div>

            {/* Pratinjau */}
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-sm"><thead className="bg-surface"><tr>{['Nama', 'Nomor (setelah dirapikan)', 'Email', 'Tag'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">{shaped.slice(0, 5).map((r) => (
                  <tr key={r._row}><td className="td">{r.name || '—'}</td><td className="td font-mono">{r.phone || <span className="text-red-700">kosong</span>}</td><td className="td">{r.email || '—'}</td><td className="td">{[...r.tags, ...autoTags].map((t) => `#${t}`).join(' ') || '—'}</td></tr>))}
                </tbody></table>
            </div>

            {progress !== null && <ProgressBar value={progress} />}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>Batal</button>
              <button className="btn-primary" disabled={!map.phone || progress !== null} onClick={run}>
                {progress !== null && <Spinner />}Impor {fmtNum(rows.length)} kontak</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

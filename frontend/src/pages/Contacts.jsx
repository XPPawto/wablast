// Manajemen audiens: tabel kontak, filter tag, tambah/ubah, bulk tag, dan import.
import { useState } from 'react';
import { Plus, Search, Trash2, Upload, Tag, Users, Pencil } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { fmtNum } from '../lib/format.js';
import { Badge, EmptyState, ErrorNote, Modal, PageHeader, Spinner, TagInput } from '../components/ui.jsx';
import ImportContactsModal from '../components/ImportContactsModal.jsx';

function ContactForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState({
    name: initial?.name || '', phone: initial?.phone || '', email: initial?.email || '', tags: initial?.tags || [],
    vars: Object.entries(initial?.variables || {}).map(([k, v]) => ({ k, v })), opt_in: initial?.opt_in ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    const body = { name: f.name, phone: f.phone, email: f.email, tags: f.tags, opt_in: f.opt_in,
      variables: Object.fromEntries(f.vars.filter((x) => x.k).map((x) => [x.k, x.v])) };
    try { await api(initial ? `/contacts/${initial.id}` : '/contacts', { method: initial ? 'PUT' : 'POST', body }); onSaved(); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Modal title={initial ? 'Ubah kontak' : 'Tambah kontak'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Nama</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label">Nomor HP</label><input className="input" required placeholder="0812 3456 7890" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        </div>
        <div><label className="label">Email</label><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label className="label">Tag</label><TagInput value={f.tags} onChange={(tags) => setF({ ...f, tags })} /></div>
        <div>
          <label className="label">Custom variable</label>
          {f.vars.map((x, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <input className="input" placeholder="nama_variabel" value={x.k} onChange={(e) => setF({ ...f, vars: f.vars.map((y, j) => j === i ? { ...y, k: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') } : y) })} />
              <input className="input" placeholder="nilai" value={x.v} onChange={(e) => setF({ ...f, vars: f.vars.map((y, j) => j === i ? { ...y, v: e.target.value } : y) })} />
              <button type="button" className="btn-ghost" aria-label="Hapus variabel" onClick={() => setF({ ...f, vars: f.vars.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
            </div>))}
          <button type="button" className="text-sm font-medium text-wa-700 hover:underline" onClick={() => setF({ ...f, vars: [...f.vars, { k: '', v: '' }] })}>+ Tambah variabel</button>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.opt_in} onChange={(e) => setF({ ...f, opt_in: e.target.checked })} />Bersedia menerima pesan (opt-in)</label>
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-ghost" onClick={onClose}>Batal</button><button className="btn-primary" disabled={busy}>{busy && <Spinner />}Simpan</button></div>
      </form>
    </Modal>
  );
}

export default function Contacts() {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [modal, setModal] = useState(null);   // 'import' | {contact} | 'new'
  const [bulkTag, setBulkTag] = useState('');
  const [error, setError] = useState(null);

  const list = usePolling(() => api('/contacts', { params: { q, tag, page, limit: 25 } }), [q, tag, page]);
  const tags = usePolling(() => api('/contacts/tags'), []);
  const reloadAll = () => { list.reload(); tags.reload(); setSelected(new Set()); };

  const rows = list.data?.data || [];
  const total = list.data?.total || 0;
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const applyBulk = async (mode) => {
    if (!bulkTag.trim()) return;
    try {
      await api('/contacts/bulk-tag', { method: 'POST', body: { ids: [...selected], [mode]: [bulkTag] } });
      setBulkTag(''); reloadAll();
    } catch (e) { setError(e); }
  };

  return (
    <>
      <PageHeader title="Kontak" subtitle="Audiens Anda. Kontak yang membalas “STOP” otomatis dikeluarkan dari blast berikutnya.">
        <button className="btn-ghost" onClick={() => setModal('import')}><Upload className="h-4 w-4" />Import CSV / Excel</button>
        <button className="btn-primary" onClick={() => setModal('new')}><Plus className="h-4 w-4" />Tambah kontak</button>
      </PageHeader>
      <div className="mb-3"><ErrorNote error={error} /></div>

      <div className="panel mb-4 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-300" />
            <input className="input pl-9" placeholder="Cari nama, nomor, atau email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <select className="input w-auto" value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} aria-label="Filter tag">
            <option value="">Semua tag</option>
            {tags.data?.map((t) => <option key={t.tag} value={t.tag}>#{t.tag} ({fmtNum(t.count)})</option>)}
          </select>
        </div>
        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-wa-50 px-3 py-2">
            <span className="text-sm font-medium">{selected.size} dipilih</span>
            <input className="input w-44" placeholder="tag, mis. vip" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} />
            <button className="btn-dark" onClick={() => applyBulk('add')}><Tag className="h-4 w-4" />Tambah tag</button>
            <button className="btn-ghost" onClick={() => applyBulk('remove')}>Hapus tag</button>
          </div>)}
      </div>

      <div className="panel overflow-hidden">
        {list.loading ? <div className="p-10 text-center"><Spinner className="mx-auto" /></div> : rows.length === 0 ? (
          <EmptyState icon={Users} title="Belum ada kontak" action={<button className="btn-primary" onClick={() => setModal('import')}>Import dari file</button>}>
            Unggah file CSV/Excel atau tambahkan kontak satu per satu.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-surface"><tr>
                <th className="th w-10"><input type="checkbox" aria-label="Pilih semua" checked={rows.every((r) => selected.has(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                <th className="th">Nama</th><th className="th">Nomor</th><th className="th">Tag</th><th className="th">Variabel</th><th className="th w-24" /></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-surface/60">
                    <td className="td"><input type="checkbox" aria-label={`Pilih ${c.name || c.phone}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                    <td className="td"><p className="font-medium">{c.name || '—'}</p><p className="text-xs text-ink-600">{c.email}</p></td>
                    <td className="td font-mono text-xs">{c.phone}{!c.opt_in && <span className="ml-2"><Badge tone="red">Berhenti</Badge></span>}</td>
                    <td className="td"><div className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} tone="green">#{t}</Badge>)}</div></td>
                    <td className="td text-xs text-ink-600">{Object.keys(c.variables).join(', ') || '—'}</td>
                    <td className="td"><div className="flex justify-end gap-1">
                      <button className="rounded p-1.5 hover:bg-surface" aria-label="Ubah" onClick={() => setModal(c)}><Pencil className="h-4 w-4" /></button>
                      <button className="rounded p-1.5 text-red-700 hover:bg-red-50" aria-label="Hapus" onClick={async () => { if (confirm(`Hapus ${c.name || c.phone}?`)) { await api(`/contacts/${c.id}`, { method: 'DELETE' }); reloadAll(); } }}><Trash2 className="h-4 w-4" /></button></div></td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-600">
          <span>{fmtNum(total)} kontak</span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button>
            <button className="btn-ghost" disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>Berikutnya</button>
          </div>
        </div>
      </div>

      {modal === 'import' && <ImportContactsModal onClose={() => setModal(null)} onDone={reloadAll} />}
      {(modal === 'new' || (modal && modal.id)) && <ContactForm initial={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAll(); }} />}
    </>
  );
}

// Template Message Manager: daftar template dari Meta, sinkronisasi, dan pembuatan baru.
import { useState } from 'react';
import { FileText, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { useAccounts } from '../context/AccountContext.jsx';
import { Badge, EmptyState, ErrorNote, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { CATEGORY } from '../components/TemplateSelector.jsx';
import TemplatePreview from '../components/TemplatePreview.jsx';
import TemplateForm from '../components/TemplateForm.jsx';

export default function Templates() {
  const { activeId } = useAccounts();
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const list = usePolling(() => (activeId ? api('/templates', { params: { account_id: activeId, status, category } }) : []), [activeId, status, category]);

  const sync = async () => {
    setSyncing(true); setError(null);
    try { await api('/templates/sync', { method: 'POST', body: { account_id: activeId } }); await list.reload(); }
    catch (e) { setError(e); } finally { setSyncing(false); }
  };
  const remove = async (t) => {
    if (!confirm(`Hapus template "${t.name}" dari Meta? Tindakan ini tidak bisa dibatalkan.`)) return;
    try { await api(`/templates/${t.id}`, { method: 'DELETE' }); list.reload(); } catch (e) { setError(e); }
  };

  if (!activeId) return <div className="panel"><EmptyState title="Pilih nomor WhatsApp dulu">Hubungkan nomor di menu Pengaturan.</EmptyState></div>;

  return (
    <>
      <PageHeader title="Template pesan" subtitle="Template harus disetujui Meta sebelum bisa dipakai blast. Di luar window 24 jam, hanya template yang boleh dikirim.">
        <button className="btn-ghost" onClick={sync} disabled={syncing}>{syncing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}Sinkronkan dari Meta</button>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Buat template</button>
      </PageHeader>
      <div className="mb-3"><ErrorNote error={error} /></div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
          <option value="">Semua status</option><option value="APPROVED">Approved</option><option value="PENDING">Menunggu review</option><option value="REJECTED">Ditolak</option></select>
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter kategori">
          <option value="">Semua kategori</option>{Object.entries(CATEGORY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>

      {list.loading ? <Spinner /> : !list.data?.length ? (
        <div className="panel"><EmptyState icon={FileText} title="Belum ada template" action={<button className="btn-primary" onClick={sync}>Sinkronkan dari Meta</button>}>
          Tarik template yang sudah ada di akun WhatsApp Business Anda, atau buat yang baru.</EmptyState></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((t) => (
            <div key={t.id} className="panel flex flex-col p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-mono text-sm font-medium">{t.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5"><StatusBadge status={t.status} /><Badge tone={CATEGORY[t.category]?.[1]}>{CATEGORY[t.category]?.[0]}</Badge><Badge>{t.language}</Badge></div></div>
                <button className="rounded p-1.5 text-red-700 hover:bg-red-50" aria-label={`Hapus ${t.name}`} onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></button>
              </div>
              <TemplatePreview {...t} />
              {t.status === 'REJECTED' && t.rejected_reason && t.rejected_reason !== 'NONE' && <p className="mt-2 text-xs text-red-700">Alasan penolakan: {t.rejected_reason}</p>}
            </div>))}
        </div>)}

      {creating && <TemplateForm accountId={activeId} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); list.reload(); }} />}
    </>
  );
}

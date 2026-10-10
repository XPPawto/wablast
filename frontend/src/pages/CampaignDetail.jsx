// Monitoring kampanye real-time (polling 2 detik saat berjalan): progres, statistik, kontrol, log, dan retry.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pause, Play, RotateCcw, XCircle, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { fmtDateTime, fmtNum, pct } from '../lib/format.js';
import { Badge, ErrorNote, ProgressBar, Spinner, StatusBadge } from '../components/ui.jsx';

const FILTERS = [['', 'Semua'], ['queued,sending', 'Antre'], ['sent,delivered,read', 'Terkirim'], ['read', 'Dibaca'], ['failed', 'Gagal']];

export default function CampaignDetail() {
  const { id } = useParams();
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');

  // Polling cepat selama kampanye masih aktif; lambat bila sudah selesai
  const [live, setLive] = useState(true);
  const camp = usePolling(async () => { const c = await api(`/campaigns/${id}`); setLive(['running', 'scheduled'].includes(c.status)); return c; }, [id], live ? 2000 : 15000);
  const logs = usePolling(() => api(`/campaigns/${id}/logs`, { params: { status: filter, page, limit: 15 } }), [id, filter, page], live ? 4000 : 0);

  const c = camp.data;
  if (!c) return camp.error ? <ErrorNote error={camp.error} /> : <Spinner />;

  const done = c.sent + c.failed;
  const action = async (name, path, body) => {
    setBusy(name); setError(null); setNotice('');
    try {
      const r = await api(`/campaigns/${id}/${path}`, { method: 'POST', body });
      if (r?.requeued !== undefined) setNotice(r.requeued ? `${fmtNum(r.requeued)} pesan dimasukkan kembali ke antrian.` : 'Tidak ada pesan gagal yang layak dicoba ulang.');
      await Promise.all([camp.reload(), logs.reload()]);
    } catch (e) { setError(e); } finally { setBusy(null); }
  };
  const Btn = ({ name, path, icon: Icon, children, cls = 'btn-ghost', body, confirmText }) => (
    <button className={cls} disabled={!!busy} onClick={() => (!confirmText || confirm(confirmText)) && action(name, path, body)}>
      {busy === name ? <Spinner /> : <Icon className="h-4 w-4" />}{children}</button>);

  const stats = [['Terkirim', c.sent, 'text-ink-900'], ['Sampai', c.delivered, 'text-wa-700'], ['Dibaca', c.read, 'text-violet-700'], ['Gagal', c.failed, 'text-red-700'], ['Antre', c.pending, 'text-ink-600']];

  return (
    <>
      <Link to="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-600 hover:text-ink-900"><ArrowLeft className="h-4 w-4" />Semua kampanye</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">{c.name}</h1><StatusBadge status={c.status} /></div>
          <p className="mt-1 text-sm text-ink-600">{c.account_label} · template <span className="font-mono">{c.template_name}</span>
            {c.status === 'scheduled' && ` · kirim ${fmtDateTime(c.scheduled_at)}`}</p></div>
        <div className="flex flex-wrap gap-2">
          {['running', 'scheduled'].includes(c.status) && <Btn name="pause" path="pause" icon={Pause}>Jeda</Btn>}
          {c.status === 'paused' && <Btn name="resume" path="resume" icon={Play} cls="btn-primary">Lanjutkan</Btn>}
          {c.failed > 0 && c.status !== 'cancelled' && <Btn name="retry" path="retry-failed" icon={RotateCcw}>Coba ulang yang gagal ({fmtNum(c.failed)})</Btn>}
          {!['completed', 'cancelled'].includes(c.status) && <Btn name="cancel" path="cancel" icon={XCircle} cls="btn-danger" confirmText="Batalkan kampanye? Pesan yang belum terkirim tidak akan dikirim.">Batalkan</Btn>}
        </div>
      </div>

      <div className="mb-4 space-y-3"><ErrorNote error={error} />
        {notice && <p className="rounded-md bg-wa-50 px-3 py-2 text-sm text-wa-700">{notice}</p>}
        {c.last_error && <p className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{c.last_error}</p>}</div>

      <div className="panel mb-4 p-5">
        <div className="mb-2 flex items-baseline justify-between"><p className="font-display text-3xl font-bold">{pct(done, c.total_recipients)}%</p>
          <p className="text-sm text-ink-600">{fmtNum(done)} dari {fmtNum(c.total_recipients)} penerima diproses</p></div>
        <ProgressBar value={pct(done, c.total_recipients)} className="h-3" tone={c.status === 'paused' ? 'bg-amber-400' : 'bg-wa-500'} />
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {stats.map(([l, v, cls]) => <div key={l}><p className="text-sm text-ink-600">{l}</p><p className={`font-display text-2xl font-bold ${cls}`}>{fmtNum(v)}</p></div>)}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-lg font-bold">Log pengiriman</h2>
          <div className="flex flex-wrap gap-1">{FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => { setFilter(k); setPage(1); }} className={`rounded px-2.5 py-1 text-sm ${filter === k ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-surface'}`}>{l}</button>))}</div>
        </div>
        <div className="overflow-x-auto"><table className="w-full">
          <thead className="bg-surface"><tr><th className="th">Penerima</th><th className="th">Status</th><th className="th">Waktu kirim</th><th className="th">Keterangan</th></tr></thead>
          <tbody className="divide-y divide-line">
            {logs.data?.data.map((l) => (
              <tr key={l.id}>
                <td className="td"><p className="font-medium">{l.name || '—'}</p><p className="font-mono text-xs text-ink-600">{l.phone}</p></td>
                <td className="td"><StatusBadge status={l.status} /></td>
                <td className="td text-xs text-ink-600">{fmtDateTime(l.sent_at)}</td>
                <td className="td max-w-sm text-xs">{l.error_message ? <span className="text-red-700">{l.error_code && <Badge tone="red">#{l.error_code}</Badge>} {l.error_message}</span> : l.attempts > 1 ? <span className="text-ink-600">Percobaan ke-{l.attempts}</span> : '—'}</td>
              </tr>))}
            {logs.data && !logs.data.data.length && <tr><td colSpan={4} className="td py-10 text-center text-ink-600">Tidak ada log untuk filter ini.</td></tr>}
          </tbody></table></div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-600">
          <span>{fmtNum(logs.data?.total)} baris</span>
          <div className="flex gap-2"><button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Sebelumnya</button>
            <button className="btn-ghost" disabled={page * 15 >= (logs.data?.total || 0)} onClick={() => setPage(page + 1)}>Berikutnya</button></div>
        </div>
      </div>
    </>
  );
}

// Dashboard: ringkasan, kesehatan nomor (Quality Rating + Tier), dan grafik performa harian.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RefreshCw, Plus, ShieldCheck, Send } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { useAccounts } from '../context/AccountContext.jsx';
import { fmtNum, fmtDay, pct, TIER_LABEL } from '../lib/format.js';
import { EmptyState, PageHeader, ProgressBar, Spinner, StatusBadge } from '../components/ui.jsx';

const QUALITY = {
  GREEN:  { label: 'Hijau — sehat', cls: 'bg-wa-500', text: 'Kualitas pesan bagus. Aman untuk blast.' },
  YELLOW: { label: 'Kuning — waspada', cls: 'bg-amber-400', text: 'Banyak pelanggan memblokir/melaporkan. Kurangi frekuensi dan perbaiki isi pesan.' },
  RED:    { label: 'Merah — berisiko', cls: 'bg-red-500', text: 'Nomor berisiko dibatasi. Hentikan blast marketing sampai kualitas pulih.' },
  UNKNOWN:{ label: 'Belum diketahui', cls: 'bg-ink-300', text: 'Segarkan data dari Meta.' },
};

/** Meter kapasitas 24 jam: 20 segmen terisi sesuai pemakaian — elemen utama dashboard. */
function TierMeter({ used, limit, tier }) {
  const ratio = limit ? Math.min(1, used / limit) : 0;
  const filled = Math.round(ratio * 20);
  const hot = ratio >= 0.9, warm = ratio >= 0.7;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-bold">{fmtNum(used)}</span>
        <span className="text-lg text-ink-600">/ {limit ? fmtNum(limit) : TIER_LABEL[tier] || '—'}</span>
        <span className="text-sm text-ink-600">penerima unik per 24 jam</span>
      </div>
      <div className="mt-4 flex gap-1" role="meter" aria-valuenow={used} aria-valuemax={limit || undefined} aria-label="Pemakaian tier 24 jam">
        {Array.from({ length: 20 }, (_, i) => (
          <span key={i} className={`h-8 flex-1 rounded-sm ${i < filled ? (hot ? 'bg-red-500' : warm ? 'bg-amber-400' : 'bg-wa-500') : 'bg-surface'}`} />
        ))}
      </div>
      <p className="mt-2 text-sm text-ink-600">
        {limit ? `Sisa kapasitas sekitar ${fmtNum(Math.max(0, limit - used))} penerima.` : 'Tier tanpa batas.'}
        {hot && <span className="font-medium text-red-700"> Hampir penuh — jadwalkan blast berikutnya setelah 24 jam.</span>}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { active, activeId, refresh, loading: accLoading } = useAccounts();
  const [days, setDays] = useState(14);
  const [syncing, setSyncing] = useState(false);

  const summary = usePolling(() => api('/dashboard/summary', { params: { account_id: activeId } }), [activeId], 15000);
  const daily = usePolling(() => api('/dashboard/daily', { params: { account_id: activeId, days } }), [activeId, days], 30000);
  const campaigns = usePolling(() => api('/campaigns', { params: { account_id: activeId } }), [activeId], 15000);

  const syncHealth = async () => {
    setSyncing(true);
    try { await api(`/accounts/${activeId}/refresh`, { method: 'POST' }); await refresh(); await summary.reload(); }
    finally { setSyncing(false); }
  };

  if (accLoading) return <Spinner />;
  if (!active) return (
    <div className="panel"><EmptyState icon={ShieldCheck} title="Hubungkan nomor WhatsApp Anda"
      action={<Link to="/settings" className="btn-primary">Buka pengaturan</Link>}>
      Masukkan Phone Number ID, WABA ID, dan token dari Meta untuk mulai mengirim kampanye.</EmptyState></div>
  );

  const t = summary.data?.totals;
  const h = summary.data?.health;
  const q = QUALITY[h?.quality_rating] || QUALITY.UNKNOWN;
  const stats = t ? [
    { label: 'Total kampanye', value: t.campaigns, sub: `${fmtNum(t.queued)} pesan dalam antrian` },
    { label: 'Pesan terkirim', value: t.sent, sub: `${pct(t.delivered, t.sent)}% sampai ke perangkat` },
    { label: 'Pesan dibaca', value: t.read, sub: `${pct(t.read, t.sent)}% dari terkirim` },
    { label: 'Pesan gagal', value: t.failed, sub: `${pct(t.failed, t.sent + t.failed)}% dari percobaan`, bad: t.failed > 0 },
  ] : [];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Performa blast untuk ${active.label}. Data diperbarui otomatis.`}>
        <button className="btn-ghost" onClick={syncHealth} disabled={syncing}>{syncing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}Segarkan status nomor</button>
        <Link to="/campaigns/new" className="btn-primary"><Plus className="h-4 w-4" />Kampanye baru</Link>
      </PageHeader>

      {/* Meter tier + kualitas nomor */}
      <div className="panel mb-4 grid gap-0 lg:grid-cols-[1fr_20rem]">
        <div className="p-5">
          <p className="mb-3 text-sm font-medium text-ink-600">Batas pengiriman harian (Messaging Tier)</p>
          {h ? <TierMeter used={h.used_24h} limit={h.tier_limit} tier={h.tier} /> : <Spinner />}
        </div>
        <div className="border-t border-line p-5 lg:border-l lg:border-t-0">
          <p className="mb-3 text-sm font-medium text-ink-600">Quality Rating</p>
          <div className="flex items-center gap-3">
            <span className={`h-9 w-9 rounded-full ${q.cls}`} />
            <div><p className="font-display text-lg font-bold">{q.label}</p>
              <p className="text-xs text-ink-600">{h?.display_phone_number}</p></div>
          </div>
          <p className="mt-3 text-sm text-ink-800">{q.text}</p>
        </div>
      </div>

      {/* Strip statistik: satu panel dibagi garis tipis, bukan empat kartu terpisah */}
      <div className="panel mb-4 grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line sm:[&>*:nth-child(-n+2)]:border-b-0 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-line sm:[&>*:nth-child(odd)]:border-r-0">
        {stats.map((s) => (
          <div key={s.label} className="p-5">
            <p className="text-sm text-ink-600">{s.label}</p>
            <p className={`mt-1 font-display text-3xl font-bold ${s.bad ? 'text-red-700' : ''}`}>{fmtNum(s.value)}</p>
            <p className="mt-1 text-xs text-ink-600">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Grafik harian */}
      <div className="panel mb-4 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Performa harian</h2>
          <div className="flex gap-1" role="group" aria-label="Rentang hari">
            {[7, 14, 30].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={`rounded px-2.5 py-1 text-sm ${days === d ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-surface'}`}>{d} hari</button>
            ))}
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily.data || []} margin={{ left: -16, right: 8, top: 4 }}>
              <CartesianGrid stroke="#DDE4E2" vertical={false} />
              <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 12, fill: '#256058' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#256058' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip labelFormatter={fmtDay} contentStyle={{ borderRadius: 8, border: '1px solid #DDE4E2', fontSize: 13 }} />
              <Area type="monotone" dataKey="sent" name="Terkirim" stroke="#1A4A42" fill="#1A4A42" fillOpacity={0.08} strokeWidth={2} />
              <Area type="monotone" dataKey="delivered" name="Sampai" stroke="#1FA855" fill="#1FA855" fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="read" name="Dibaca" stroke="#7C3AED" fill="#7C3AED" fillOpacity={0.06} strokeWidth={2} />
              <Area type="monotone" dataKey="failed" name="Gagal" stroke="#DC2626" fill="#DC2626" fillOpacity={0.06} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Kampanye terbaru */}
      <div className="panel overflow-hidden">
        <div className="border-b border-line px-5 py-3.5"><h2 className="text-lg font-bold">Kampanye terbaru</h2></div>
        {campaigns.data?.length ? (
          <ul className="divide-y divide-line">
            {campaigns.data.slice(0, 5).map((c) => {
              const done = c.sent + c.failed;
              return (
                <li key={c.id}>
                  <Link to={`/campaigns/${c.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 hover:bg-surface">
                    <div className="min-w-0 flex-1"><p className="truncate font-medium">{c.name}</p><p className="truncate text-xs text-ink-600">{c.template_name}</p></div>
                    <div className="w-40"><ProgressBar value={pct(done, c.total_recipients)} /><p className="mt-1 text-xs text-ink-600">{fmtNum(done)} / {fmtNum(c.total_recipients)}</p></div>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState icon={Send} title="Belum ada kampanye" action={<Link to="/campaigns/new" className="btn-primary">Buat kampanye pertama</Link>}>Pilih audiens dan template, lalu kirim sekarang atau jadwalkan.</EmptyState>}
      </div>
    </>
  );
}

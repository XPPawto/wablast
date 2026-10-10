import { Link } from 'react-router-dom';
import { Plus, Send } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { useAccounts } from '../context/AccountContext.jsx';
import { fmtDateTime, fmtNum, pct } from '../lib/format.js';
import { EmptyState, PageHeader, ProgressBar, Spinner, StatusBadge } from '../components/ui.jsx';

export default function Campaigns() {
  const { activeId } = useAccounts();
  const { data, loading } = usePolling(() => api('/campaigns', { params: { account_id: activeId } }), [activeId], 10000);
  return (
    <>
      <PageHeader title="Kampanye" subtitle="Semua blast untuk nomor yang sedang aktif.">
        <Link to="/campaigns/new" className="btn-primary"><Plus className="h-4 w-4" />Kampanye baru</Link>
      </PageHeader>
      <div className="panel overflow-hidden">
        {loading ? <div className="p-10 text-center"><Spinner className="mx-auto" /></div> : !data?.length ? (
          <EmptyState icon={Send} title="Belum ada kampanye" action={<Link to="/campaigns/new" className="btn-primary">Buat kampanye</Link>}>Kampanye yang Anda buat akan muncul di sini beserta progresnya.</EmptyState>
        ) : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b border-line bg-surface"><tr><th className="th">Kampanye</th><th className="th">Status</th><th className="th w-56">Progres</th><th className="th">Dibaca</th><th className="th">Dibuat</th></tr></thead>
            <tbody className="divide-y divide-line">{data.map((c) => {
              const done = c.sent + c.failed;
              return (
                <tr key={c.id} className="hover:bg-surface/60">
                  <td className="td"><Link to={`/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link><p className="text-xs text-ink-600">{c.template_name}</p></td>
                  <td className="td"><StatusBadge status={c.status} /></td>
                  <td className="td"><ProgressBar value={pct(done, c.total_recipients)} /><p className="mt-1 text-xs text-ink-600">{fmtNum(done)} / {fmtNum(c.total_recipients)}{c.failed > 0 && <span className="text-red-700"> · {fmtNum(c.failed)} gagal</span>}</p></td>
                  <td className="td">{pct(c.read, c.sent)}%</td>
                  <td className="td text-xs text-ink-600">{c.status === 'scheduled' ? `Kirim ${fmtDateTime(c.scheduled_at)}` : fmtDateTime(c.created_at)}</td>
                </tr>); })}</tbody></table></div>)}
      </div>
    </>
  );
}

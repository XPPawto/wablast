// Pemilih template untuk wizard kampanye: hanya menampilkan template APPROVED,
// dengan filter kategori dan pratinjau gelembung chat.
import { useState } from 'react';
import { Check, FileText } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { Badge, EmptyState, Spinner } from './ui.jsx';
import TemplatePreview from './TemplatePreview.jsx';

export const CATEGORY = { MARKETING: ['Marketing', 'violet'], UTILITY: ['Utility', 'blue'], AUTHENTICATION: ['Authentication', 'yellow'] };

export default function TemplateSelector({ accountId, value, onSelect }) {
  const [cat, setCat] = useState('');
  const { data, loading } = usePolling(() => api('/templates', { params: { account_id: accountId, status: 'APPROVED', category: cat } }), [accountId, cat]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter kategori">
        {[['', 'Semua'], ...Object.entries(CATEGORY).map(([k, [l]]) => [k, l])].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setCat(k)} className={`rounded-full px-3 py-1 text-sm ${cat === k ? 'bg-ink-900 text-white' : 'border border-line bg-white hover:bg-surface'}`}>{l}</button>))}
      </div>
      {loading ? <Spinner /> : !data?.length ? (
        <div className="panel"><EmptyState icon={FileText} title="Belum ada template yang disetujui">Buat template di menu Template, atau klik “Sinkronkan dari Meta” bila sudah dibuat di Business Manager.</EmptyState></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((t) => {
            const on = value?.id === t.id;
            return (
              <button type="button" key={t.id} onClick={() => onSelect(t)} aria-pressed={on}
                className={`relative rounded-lg border p-3 text-left transition-colors ${on ? 'border-wa-500 bg-wa-50 ring-1 ring-wa-500' : 'border-line bg-white hover:border-ink-300'}`}>
                {on && <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-wa-600 text-white"><Check className="h-3 w-3" /></span>}
                <div className="mb-2 flex flex-wrap items-center gap-2 pr-6"><span className="font-mono text-sm font-medium">{t.name}</span>
                  <Badge tone={CATEGORY[t.category]?.[1]}>{CATEGORY[t.category]?.[0]}</Badge><Badge>{t.language}</Badge></div>
                <TemplatePreview {...t} />
              </button>);
          })}
        </div>)}
    </div>
  );
}

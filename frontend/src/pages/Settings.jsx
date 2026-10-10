// Pengaturan kredensial & multi-akun WhatsApp Business.
import { useState } from 'react';
import { Eye, EyeOff, Plus, RefreshCw, Trash2, Copy, Check, KeyRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { useAccounts } from '../context/AccountContext.jsx';
import { fmtDateTime, TIER_LABEL } from '../lib/format.js';
import { Badge, ErrorNote, Modal, PageHeader, Spinner } from '../components/ui.jsx';

const EMPTY = { label: '', phone_number_id: '', waba_id: '', access_token: '' };
const QUALITY_TONE = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' };

function CopyField({ label, value }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex gap-2">
        <input className="input font-mono text-xs" readOnly value={value || ''} />
        <button className="btn-ghost" onClick={() => { navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }} aria-label={`Salin ${label}`}>
          {ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function AccountForm({ initial, onClose, onSaved }) {
  const editing = !!initial?.id;
  const [f, setF] = useState(initial ? { label: initial.label, waba_id: initial.waba_id, access_token: '' } : EMPTY);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api(editing ? `/accounts/${initial.id}` : '/accounts', { method: editing ? 'PUT' : 'POST', body: f });
      onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? 'Ubah nomor WhatsApp' : 'Tambah nomor WhatsApp'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <div><label className="label">Nama internal</label>
          <input className="input" required placeholder="mis. CS Toko Utama" value={f.label} onChange={set('label')} /></div>
        {!editing && (
          <div><label className="label">Phone Number ID</label>
            <input className="input font-mono" required inputMode="numeric" value={f.phone_number_id} onChange={set('phone_number_id')} />
            <p className="hint">Meta for Developers → WhatsApp → API Setup. Ini bukan nomor telepon, melainkan ID numerik.</p></div>
        )}
        <div><label className="label">WhatsApp Business Account ID (WABA)</label>
          <input className="input font-mono" required inputMode="numeric" value={f.waba_id} onChange={set('waba_id')} /></div>
        <div><label className="label">System User Permanent Access Token</label>
          <div className="flex gap-2">
            <input className="input font-mono" type={show ? 'text' : 'password'} required={!editing} autoComplete="off"
              placeholder={editing ? 'Kosongkan bila tidak diganti' : 'EAAG…'} value={f.access_token} onChange={set('access_token')} />
            <button type="button" className="btn-ghost" onClick={() => setShow(!show)} aria-label="Tampilkan token">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <p className="hint">Buat di Business Settings → System Users, dengan izin whatsapp_business_messaging dan whatsapp_business_management. Token dienkripsi sebelum disimpan.</p></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
          <button className="btn-primary" disabled={busy}>{busy && <Spinner />}{editing ? 'Simpan perubahan' : 'Verifikasi dan simpan'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Settings() {
  const { accounts, activeId, switchTo, refresh } = useAccounts();
  const cfg = usePolling(() => api('/config'), []);
  const [form, setForm] = useState(null);        // null | {} (baru) | akun (edit)
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const act = async (id, fn) => {
    setBusyId(id); setError(null);
    try { await fn(); await refresh(); } catch (e) { setError(e); } finally { setBusyId(null); }
  };

  return (
    <>
      <PageHeader title="Pengaturan" subtitle="Kelola kredensial WhatsApp Cloud API. Anda bisa menghubungkan lebih dari satu nomor dan berpindah lewat menu di sidebar.">
        <button className="btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" />Tambah nomor</button>
      </PageHeader>
      <div className="mb-4"><ErrorNote error={error} /></div>

      <div className="mb-6 space-y-3">
        {accounts.map((a) => (
          <div key={a.id} className={`panel flex flex-wrap items-center gap-4 p-4 ${a.id === activeId ? 'border-wa-500 ring-1 ring-wa-500' : ''}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-lg font-bold">{a.label}</p>
                {a.id === activeId && <Badge tone="green">Aktif</Badge>}
                <Badge tone={QUALITY_TONE[a.quality_rating] || 'gray'}>Kualitas: {a.quality_rating}</Badge>
                {a.messaging_limit_tier && <Badge>Tier {TIER_LABEL[a.messaging_limit_tier] || a.messaging_limit_tier}/hari</Badge>}
              </div>
              <p className="mt-1 text-sm text-ink-600">{a.verified_name} · {a.display_phone_number}</p>
              <p className="font-mono text-xs text-ink-600">ID {a.phone_number_id} · WABA {a.waba_id} · sinkron {fmtDateTime(a.health_synced_at)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {a.id !== activeId && <button className="btn-ghost" onClick={() => switchTo(a.id)}>Gunakan</button>}
              <button className="btn-ghost" onClick={() => act(a.id, () => api(`/accounts/${a.id}/refresh`, { method: 'POST' }))} disabled={busyId === a.id}>
                {busyId === a.id ? <Spinner /> : <RefreshCw className="h-4 w-4" />}Uji koneksi</button>
              <button className="btn-ghost" onClick={() => setForm(a)}><KeyRound className="h-4 w-4" />Ubah</button>
              <button className="btn-danger" aria-label={`Hapus ${a.label}`} onClick={() => confirm(`Hapus ${a.label}?`) && act(a.id, () => api(`/accounts/${a.id}`, { method: 'DELETE' }))}><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {!accounts.length && <div className="panel p-8 text-center text-sm text-ink-600">Belum ada nomor. Klik “Tambah nomor” untuk memulai.</div>}
      </div>

      <div className="panel p-5">
        <h2 className="text-lg font-bold">Webhook Meta</h2>
        <p className="mb-4 mt-1 text-sm text-ink-600">Masukkan kedua nilai ini di Meta for Developers → WhatsApp → Configuration → Webhook, lalu subscribe ke field <span className="font-mono">messages</span>. Tanpa webhook, status “sampai” dan “dibaca” tidak akan terupdate.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <CopyField label="Callback URL" value={cfg.data?.webhook_url} />
          <CopyField label="Verify token" value={cfg.data?.verify_token} />
        </div>
      </div>

      {form && <AccountForm initial={form.id ? form : null} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await refresh(); }} />}
    </>
  );
}

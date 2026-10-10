// Inbox / Live Chat sederhana. Balasan bebas hanya bisa dikirim selama window 24 jam terbuka.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, Clock, MessageSquare, Send } from 'lucide-react';
import { api } from '../lib/api.js';
import { usePolling } from '../hooks/usePolling.js';
import { useAccounts } from '../context/AccountContext.jsx';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui.jsx';
import { fmtDateTime, fmtTime } from '../lib/format.js';

const Tick = ({ s }) => s === 'read' ? <CheckCheck className="h-3.5 w-3.5 text-sky-600" /> : s === 'delivered' ? <CheckCheck className="h-3.5 w-3.5" /> : s === 'failed' ? <span className="text-red-700">gagal</span> : <Check className="h-3.5 w-3.5" />;

export default function Inbox() {
  const { activeId } = useAccounts();
  const [phone, setPhone] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  const convs = usePolling(() => (activeId ? api('/inbox/conversations', { params: { account_id: activeId } }) : []), [activeId], 6000);
  const thread = usePolling(() => (phone ? api('/inbox/messages', { params: { account_id: activeId, phone } }) : null), [activeId, phone], 4000);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread.data?.messages?.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true); setError(null);
    try { await api('/inbox/send', { method: 'POST', body: { account_id: activeId, phone, text } }); setText(''); await Promise.all([thread.reload(), convs.reload()]); }
    catch (err) { setError(err); } finally { setSending(false); }
  };

  const current = convs.data?.find((c) => c.phone === phone);
  const t = thread.data;

  return (
    <>
      <PageHeader title="Inbox" subtitle="Balasan pelanggan atas blast Anda. Butuh webhook aktif agar pesan masuk muncul di sini." />
      <div className="panel grid h-[calc(100vh-14rem)] min-h-[28rem] overflow-hidden md:grid-cols-[20rem_1fr]">
        {/* Daftar percakapan — di mobile disembunyikan saat chat dibuka */}
        <div className={`flex-col overflow-y-auto border-r border-line ${phone ? 'hidden md:flex' : 'flex'}`}>
          {convs.loading ? <div className="p-6"><Spinner /></div> : !convs.data?.length ? (
            <EmptyState icon={MessageSquare} title="Belum ada percakapan">Pesan yang Anda kirim dan balasan pelanggan akan muncul di sini.</EmptyState>
          ) : convs.data.map((c) => (
            <button key={c.phone} onClick={() => setPhone(c.phone)} className={`border-b border-line px-4 py-3 text-left hover:bg-surface ${c.phone === phone ? 'bg-wa-50' : ''}`}>
              <div className="flex items-center justify-between gap-2"><p className="truncate font-medium">{c.name || c.phone}</p><span className="shrink-0 text-xs text-ink-600">{fmtTime(c.last_at)}</span></div>
              <p className="mt-0.5 truncate text-sm text-ink-600">{c.direction === 'out' && 'Anda: '}{c.last_message}</p>
              {c.window_open && <span className="mt-1 inline-block rounded bg-wa-100 px-1.5 py-0.5 text-[11px] font-medium text-wa-700">Window terbuka</span>}
            </button>))}
        </div>

        {/* Panel chat */}
        <div className={`min-h-0 flex-col ${phone ? 'flex' : 'hidden md:flex'}`}>
          {!phone ? <div className="m-auto text-sm text-ink-600">Pilih percakapan di sebelah kiri.</div> : (<>
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <button className="md:hidden" onClick={() => setPhone(null)} aria-label="Kembali"><ArrowLeft className="h-5 w-5" /></button>
              <div><p className="font-medium">{t?.name || current?.name || phone}</p><p className="font-mono text-xs text-ink-600">{phone}</p></div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-chat p-4">
              {t?.messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : ''}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${m.direction === 'out' ? 'rounded-tr-none bg-bubble' : 'rounded-tl-none bg-white'}`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-ink-600">{m.type === 'template' && <span>template ·</span>}{fmtTime(m.created_at)}{m.direction === 'out' && <Tick s={m.status} />}</p>
                    {m.error_message && <p className="text-[11px] text-red-700">{m.error_message}</p>}
                  </div>
                </div>))}
              <div ref={endRef} />
            </div>
            <div className="border-t border-line p-3">
              <ErrorNote error={error} />
              {t?.window_open ? (
                <form onSubmit={send} className="flex gap-2">
                  <input className="input" placeholder="Tulis balasan…" value={text} onChange={(e) => setText(e.target.value)} />
                  <button className="btn-primary" disabled={sending || !text.trim()} aria-label="Kirim">{sending ? <Spinner /> : <Send className="h-4 w-4" />}</button>
                </form>
              ) : (
                <p className="flex items-center gap-2 rounded-md bg-surface px-3 py-2.5 text-sm text-ink-600"><Clock className="h-4 w-4 shrink-0" />Window 24 jam sudah tertutup. Anda hanya bisa mengirim template message sampai pelanggan membalas lagi.</p>)}
              {t?.window_open && t.window_expires_at && <p className="mt-1.5 text-xs text-ink-600">Window tertutup {fmtDateTime(t.window_expires_at)}</p>}
            </div>
          </>)}
        </div>
      </div>
    </>
  );
}

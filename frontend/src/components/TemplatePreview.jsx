// Pratinjau template dalam bentuk gelembung chat WhatsApp.
// `values` (opsional) mengisi {{n}} dengan contoh nilai: { body:{1:'Budi'}, header:{1:'..'} }.
import { FileText, Image as ImageIcon, Phone, ExternalLink, Reply, Video } from 'lucide-react';

const fill = (text = '', vals = {}) => text.replace(/\{\{(\d+)\}\}/g, (_, n) => vals[n] ?? `{{${n}}}`);

const BTN_ICON = { URL: ExternalLink, PHONE_NUMBER: Phone, QUICK_REPLY: Reply };

export default function TemplatePreview({ header_type = 'NONE', header_text, body, footer, buttons = [], values = {}, mediaUrl }) {
  const MediaIcon = { IMAGE: ImageIcon, DOCUMENT: FileText, VIDEO: Video }[header_type];
  return (
    <div className="rounded-lg bg-chat p-4">
      <div className="max-w-[20rem] overflow-hidden rounded-lg rounded-tl-none bg-white shadow-sm">
        {header_type === 'TEXT' && header_text && <p className="px-3 pt-2.5 font-display text-[15px] font-bold">{fill(header_text, values.header)}</p>}
        {MediaIcon && (
          header_type === 'IMAGE' && mediaUrl
            ? <img src={mediaUrl} alt="" className="max-h-44 w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
            : <div className="flex h-28 items-center justify-center bg-surface text-ink-300"><MediaIcon className="h-9 w-9" /></div>
        )}
        <p className="whitespace-pre-wrap break-words px-3 py-2 text-sm leading-snug">{body ? fill(body, values.body) : <span className="text-ink-300">Isi pesan akan tampil di sini…</span>}</p>
        {footer && <p className="px-3 pb-2 text-xs text-ink-600">{footer}</p>}
        <p className="px-3 pb-1.5 text-right text-[10px] text-ink-300">09.41</p>
        {buttons.length > 0 && (
          <div className="divide-y divide-line border-t border-line">
            {buttons.map((b, i) => { const Icon = BTN_ICON[b.type] || Reply; return (
              <div key={i} className="flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-sky-700"><Icon className="h-3.5 w-3.5" />{b.text || 'Tombol'}</div>); })}
          </div>)}
      </div>
    </div>
  );
}

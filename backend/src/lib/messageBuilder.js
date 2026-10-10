// Membangun payload `components` untuk pesan template berdasarkan
// pemetaan variabel kampanye + data kontak penerima.
import { extractVariables } from './templateParser.js';

/** Ambil nilai satu variabel dari kontak sesuai aturan mapping. */
export function resolveValue(spec, contact) {
  let v = '';
  if (spec?.type === 'field') v = contact?.[spec.value] ?? '';
  else if (spec?.type === 'variable') v = contact?.variables?.[spec.value] ?? '';
  else if (spec?.type === 'static') v = spec.value ?? '';
  v = String(v ?? '');
  // Meta menolak parameter berisi newline/tab atau 4+ spasi beruntun, dan menolak string kosong.
  v = v.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();
  return v || String(spec?.fallback ?? '-');
}

/**
 * @returns {{components: object[], params: object}}
 *  components → dikirim ke Meta; params → disimpan di broadcast_logs untuk audit.
 */
export function buildComponents(template, campaign, contact) {
  const mapping = campaign.variable_mapping || {};
  const components = [];
  const params = { header: {}, body: {} };

  // ---- HEADER ----
  if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(template.header_type)) {
    const kind = template.header_type.toLowerCase();
    components.push({ type: 'header', parameters: [{ type: kind, [kind]: { link: campaign.header_media_url } }] });
  } else if (template.header_type === 'TEXT') {
    const vars = extractVariables(template.header_text);
    if (vars.length) {
      const parameters = vars.map((n) => {
        const val = resolveValue(mapping.header?.[n], contact);
        params.header[n] = val;
        return { type: 'text', text: val };
      });
      components.push({ type: 'header', parameters });
    }
  }

  // ---- BODY ----
  const bodyVars = extractVariables(template.body);
  if (bodyVars.length) {
    const parameters = bodyVars.map((n) => {
      const val = resolveValue(mapping.body?.[n], contact);
      params.body[n] = val;
      return { type: 'text', text: val };
    });
    components.push({ type: 'body', parameters });
  }
  return { components, params };
}

/** Render teks akhir (untuk riwayat chat/Inbox). */
export function renderBody(template, params) {
  return (template.body || '').replace(/\{\{(\d+)\}\}/g, (_, n) => params.body?.[n] ?? `{{${n}}}`);
}

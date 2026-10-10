// Konversi dua arah antara format komponen Meta <-> bentuk datar yang kita simpan di DB.

/** Daftar nomor variabel unik dari teks, mis. "Hai {{1}}, kode {{2}}" -> [1, 2] */
export function extractVariables(text = '') {
  return [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** Dari array `components` milik Meta -> kolom datar untuk tabel templates. */
export function parseMetaComponents(components = []) {
  const out = { header_type: 'NONE', header_text: null, body: '', footer: null, buttons: [] };
  for (const c of components) {
    if (c.type === 'HEADER') {
      out.header_type = c.format || 'TEXT';
      if (c.format === 'TEXT') out.header_text = c.text;
    } else if (c.type === 'BODY') out.body = c.text || '';
    else if (c.type === 'FOOTER') out.footer = c.text;
    else if (c.type === 'BUTTONS') out.buttons = c.buttons || [];
  }
  return out;
}

/**
 * Dari form dashboard -> array `components` untuk Meta.
 * form: { header:{type,text,handle}, body, body_examples:[], footer, buttons:[] }
 */
export function buildMetaComponents(form, headerHandle) {
  const components = [];
  const h = form.header || { type: 'NONE' };

  if (h.type === 'TEXT') {
    const c = { type: 'HEADER', format: 'TEXT', text: h.text };
    if (extractVariables(h.text).length) c.example = { header_text: [h.example || 'Contoh'] };
    components.push(c);
  } else if (['IMAGE', 'DOCUMENT', 'VIDEO'].includes(h.type)) {
    components.push({ type: 'HEADER', format: h.type, example: { header_handle: [headerHandle] } });
  }

  const body = { type: 'BODY', text: form.body };
  const vars = extractVariables(form.body);
  // Meta mewajibkan contoh nilai untuk setiap variabel body
  if (vars.length) body.example = { body_text: [vars.map((_, i) => form.body_examples?.[i] || `contoh${i + 1}`)] };
  components.push(body);

  if (form.footer) components.push({ type: 'FOOTER', text: form.footer });

  if (form.buttons?.length) {
    components.push({
      type: 'BUTTONS',
      buttons: form.buttons.map((b) => {
        if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
        return { type: 'QUICK_REPLY', text: b.text };
      }),
    });
  }
  return components;
}

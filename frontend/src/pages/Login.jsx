import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../lib/api.js';
import { ErrorNote, Spinner } from '../components/ui.jsx';

export default function Login() {
  const nav = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { token } = await api('/auth/login', { method: 'POST', body: form });
      auth.set(token);
      nav('/');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between bg-ink-900 p-12 lg:flex">
        <p className="font-display text-2xl font-bold text-white">Blast Desk</p>
        <div>
          <p className="max-w-md font-display text-4xl font-bold leading-tight text-white">Kirim ke ribuan pelanggan tanpa membuat nomor Anda diblokir.</p>
          <p className="mt-4 max-w-md text-ink-200">Antrian berjeda, pemantauan Quality Rating, dan hanya kontak yang setuju menerima pesan.</p>
        </div>
        <p className="text-xs text-ink-300">Terhubung langsung ke WhatsApp Cloud API resmi Meta.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-bold">Masuk</h1>
          <ErrorNote error={error} />
          <div><label className="label" htmlFor="u">Username</label>
            <input id="u" className="input" autoComplete="username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div><label className="label" htmlFor="p">Password</label>
            <input id="p" type="password" className="input" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner />}Masuk</button>
        </form>
      </div>
    </div>
  );
}

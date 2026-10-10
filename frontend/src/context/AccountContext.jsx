// Menyimpan daftar nomor WhatsApp & nomor yang sedang aktif (dipilih lewat switcher di sidebar).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const Ctx = createContext(null);
export const useAccounts = () => useContext(Ctx);

export function AccountProvider({ children }) {
  const [accounts, setAccounts] = useState([]);
  const [activeId, setActiveId] = useState(localStorage.getItem('wa_active_account'));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await api('/accounts');
    setAccounts(list);
    setActiveId((cur) => (list.some((a) => a.id === cur) ? cur : list[0]?.id ?? null));
    setLoading(false);
    return list;
  }, []);

  useEffect(() => { refresh().catch(() => setLoading(false)); }, [refresh]);

  const switchTo = (id) => { localStorage.setItem('wa_active_account', id); setActiveId(id); };
  const active = accounts.find((a) => a.id === activeId) || null;

  return <Ctx.Provider value={{ accounts, active, activeId: active?.id ?? null, switchTo, refresh, loading }}>{children}</Ctx.Provider>;
}

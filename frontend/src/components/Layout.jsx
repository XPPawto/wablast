// Kerangka aplikasi: sidebar (desktop) / drawer (mobile) + pengalih nomor WhatsApp.
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Send, MessageSquare, Settings, Menu, X, LogOut, ChevronsUpDown } from 'lucide-react';
import { useAccounts } from '../context/AccountContext.jsx';
import { auth } from '../lib/api.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/campaigns', label: 'Kampanye', icon: Send },
  { to: '/contacts', label: 'Kontak', icon: Users },
  { to: '/templates', label: 'Template', icon: FileText },
  { to: '/inbox', label: 'Inbox', icon: MessageSquare },
  { to: '/settings', label: 'Pengaturan', icon: Settings },
];

const QUALITY_DOT = { GREEN: 'bg-wa-500', YELLOW: 'bg-amber-400', RED: 'bg-red-500' };

function AccountSwitcher() {
  const { accounts, active, switchTo } = useAccounts();
  const [open, setOpen] = useState(false);
  if (!accounts.length) return <NavLink to="/settings" className="block rounded-md bg-ink-800 px-3 py-2.5 text-sm text-ink-200">Hubungkan nomor WhatsApp →</NavLink>;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 rounded-md bg-ink-800 px-3 py-2.5 text-left hover:bg-ink-700" aria-haspopup="listbox" aria-expanded={open}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${QUALITY_DOT[active?.quality_rating] || 'bg-ink-300'}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{active?.label}</span>
          <span className="block truncate text-xs text-ink-300">{active?.display_phone_number || active?.phone_number_id}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-ink-300" />
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-ink-600 bg-ink-800 shadow-lg">
          {accounts.map((a) => (
            <li key={a.id}>
              <button onClick={() => { switchTo(a.id); setOpen(false); }} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-700 ${a.id === active?.id ? 'text-white' : 'text-ink-200'}`}>
                <span className={`h-2 w-2 rounded-full ${QUALITY_DOT[a.quality_rating] || 'bg-ink-300'}`} />
                <span className="truncate">{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SidebarContent({ onNavigate }) {
  const nav = useNavigate();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-1 pt-1">
        <p className="font-display text-xl font-bold text-white">Blast Desk</p>
        <p className="text-xs text-ink-300">Campaign manager untuk WhatsApp</p>
      </div>
      <AccountSwitcher />
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-wa-600 text-white' : 'text-ink-200 hover:bg-ink-800 hover:text-white'}`}>
            <Icon className="h-[18px] w-[18px]" />{label}
          </NavLink>
        ))}
      </nav>
      <button onClick={() => { auth.clear(); nav('/login'); }} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-300 hover:bg-ink-800 hover:text-white">
        <LogOut className="h-[18px] w-[18px]" />Keluar
      </button>
    </div>
  );
}

export default function Layout() {
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-ink-900 lg:block"><SidebarContent /></aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <p className="font-display text-lg font-bold">Blast Desk</p>
        <button onClick={() => setDrawer(true)} aria-label="Buka menu" className="rounded p-1.5 hover:bg-surface"><Menu className="h-5 w-5" /></button>
      </header>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900">
            <button onClick={() => setDrawer(false)} className="absolute right-3 top-3 text-ink-200" aria-label="Tutup menu"><X className="h-5 w-5" /></button>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8"><Outlet /></main>
    </div>
  );
}

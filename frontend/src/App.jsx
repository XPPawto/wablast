import { Navigate, Route, Routes } from 'react-router-dom';
import { auth } from './lib/api.js';
import { AccountProvider } from './context/AccountContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Settings from './pages/Settings.jsx';
import Contacts from './pages/Contacts.jsx';
import Templates from './pages/Templates.jsx';
import Campaigns from './pages/Campaigns.jsx';
import CampaignWizard from './pages/CampaignWizard.jsx';
import CampaignDetail from './pages/CampaignDetail.jsx';
import Inbox from './pages/Inbox.jsx';

/** Halaman di dalam sini hanya bisa diakses setelah login. */
function Protected() {
  if (!auth.get()) return <Navigate to="/login" replace />;
  return (
    <AccountProvider>
      <Layout />
    </AccountProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/new" element={<CampaignWizard />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="templates" element={<Templates />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

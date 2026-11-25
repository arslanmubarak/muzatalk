import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Database,
  Download,
  FileText,
  HardDrive,
  Lock,
  LogOut,
  PackageCheck,
  Search,
  Server,
  Settings,
  ShieldAlert,
  Sliders,
  UploadCloud,
  Users,
} from 'lucide-react';
import { api, getAdminToken, setAdminToken } from '../services/api';
import { MuzTalkLogo, UserAvatar } from './MuzTalkLogo';
import type { AuditLogDTO, ReportDTO, SystemHealthDTO, SystemIntegrationsDTO, UserDTO } from '../../shared/types';

type AdminTab = 'overview' | 'users' | 'reports' | 'infrastructure' | 'integrations' | 'updates' | 'audit' | 'config';

export function AdminDashboard({ onBackToApp }: { onBackToApp: () => void }) {
  const [authedAdmin, setAuthedAdmin] = useState<{
    email: string;
    displayName: string;
    role: string;
  } | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [email, setEmail] = useState('admin@muztalk.app');
  const [displayName, setDisplayName] = useState('MuzTalk Super Admin');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [tab, setTab] = useState<AdminTab>('overview');
  const [health, setHealth] = useState<SystemHealthDTO | null>(null);
  const [config, setConfig] = useState<{
    maintenanceMode: boolean;
    allowNewRegistrations: boolean;
    maxUploadMb: number;
    statusExpiryHours: number;
    e2eeEnforced: boolean;
    blockScreenCapture: boolean;
  } | null>(null);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [reports, setReports] = useState<ReportDTO[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogDTO[]>([]);
  const [integrations, setIntegrations] = useState<SystemIntegrationsDTO | null>(null);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [integrationNotice, setIntegrationNotice] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  const [persistence, setPersistence] = useState<{
    dataDir: string;
    uploadsDir: string;
    snapshotFile: string;
    mysqlConnected: boolean;
    mysqlVersion: string | null;
    lastPersistedAt: string | null;
    counts: {
      users: number;
      admins: number;
      conversations: number;
      messages: number;
      groups: number;
      calls: number;
      mediaFiles: number;
    };
  } | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [runBuildMode, setRunBuildMode] = useState<'auto' | 'true' | 'false'>('auto');
  const [restartAfterUpdate, setRestartAfterUpdate] = useState(false);
  const [zipUpdating, setZipUpdating] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<string | null>(null);
  const [updateResult, setUpdateResult] = useState<{
    extractedFilesCount: number;
    skippedProtectedCount: number;
    strippedRootFolder: string | null;
    hasDist: boolean;
    hasServerJs: boolean;
    buildRan: boolean;
    syncedPublicHtml: boolean;
    restartTriggered: boolean;
    restartScheduled: boolean;
    persistence: { counts: { users: number; messages: number; groups: number } };
  } | null>(null);

  useEffect(() => {
    api.adminBootstrapStatus().then((res) => {
      setNeedsBootstrap(res.needsSetup);
    }).catch(() => setNeedsBootstrap(false));
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (!getAdminToken()) return;
    setDataLoading(true);
    try {
      const [ov, us, rp, al, ig, ps] = await Promise.all([
        api.adminOverview(),
        api.adminUsers(userSearch),
        api.adminReports(),
        api.adminAuditLogs(),
        api.adminGetIntegrations(),
        api.adminPersistenceStatus(),
      ]);
      setHealth(ov.health);
      setConfig(ov.config);
      setUsers(us.users);
      setReports(rp.reports);
      setAuditLogs(al.logs);
      setIntegrations(ig.integrations);
      setPersistence(ps.persistence);
    } catch (err) {
      console.error(err);
    } finally {
      setDataLoading(false);
    }
  }, [userSearch]);

  useEffect(() => {
    if (authedAdmin) {
      loadDashboardData();
    }
  }, [authedAdmin, loadDashboardData]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      if (needsBootstrap) {
        const res = await api.adminBootstrap({ email, displayName, password });
        setAdminToken(res.token);
        setAuthedAdmin(res.admin);
        setNeedsBootstrap(false);
      } else {
        const res = await api.adminLogin({ email, password });
        setAdminToken(res.token);
        setAuthedAdmin(res.admin);
      }
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleToggleUserStatus = async (user: UserDTO) => {
    const next = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await api.adminUpdateUserStatus(user.id, next);
    await loadDashboardData();
  };

  const handleResolveReport = async (reportId: string, status: 'RESOLVED' | 'DISMISSED') => {
    await api.adminResolveReport(reportId, status);
    await loadDashboardData();
  };

  const handleToggleUserScreenCapture = async (user: UserDTO) => {
    await api.adminUpdateUserScreenCapture(user.id, !user.blockScreenCapture);
    await loadDashboardData();
  };

  const handleToggleConfig = async (
    key: 'maintenanceMode' | 'allowNewRegistrations' | 'e2eeEnforced' | 'blockScreenCapture'
  ) => {
    if (!config) return;
    const nextVal = !config[key];
    const res = await api.adminUpdateConfig({ [key]: nextVal });
    setConfig(res.config as typeof config);
    await loadDashboardData();
  };

  const handleSaveIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!integrations) return;
    setIntegrationNotice(null);
    try {
      const res = await api.adminUpdateIntegrations(integrations);
      setIntegrations(res.integrations);
      setHealth(res.health);
      setIntegrationNotice('All system integrations saved.');
    } catch (err) {
      setIntegrationNotice((err as Error).message);
    }
  };

  const handleTestMysql = async () => {
    if (!integrations) return;
    setIntegrationNotice(null);
    try {
      const res = await api.adminTestMysql({ mysql: integrations.mysql });
      setHealth(res.health);
      setIntegrationNotice(`MySQL 8 connected successfully (v${res.version}).`);
    } catch (err) {
      setIntegrationNotice(`MySQL error: ${(err as Error).message}`);
    }
  };

  const handleTestSmtp = async () => {
    if (!integrations) return;
    setIntegrationNotice(null);
    try {
      const target = smtpTestEmail.trim() || authedAdmin?.email || '';
      const res = await api.adminTestSmtp({ to: target, smtp: integrations.smtp });
      setIntegrationNotice(res.message);
    } catch (err) {
      setIntegrationNotice(`SMTP error: ${(err as Error).message}`);
    }
  };

  const handleTestFirebase = async () => {
    if (!integrations) return;
    setIntegrationNotice(null);
    try {
      const res = await api.adminTestFirebase({ firebase: integrations.firebase });
      setIntegrations(res.integrations);
      setHealth(res.health);
      setIntegrationNotice(`Firebase Admin verified for project ${res.projectId} (${res.clientEmail}).`);
    } catch (err) {
      setIntegrationNotice(`Firebase error: ${(err as Error).message}`);
    }
  };

  const handleFirebaseJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !integrations) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        setIntegrationNotice('Invalid Firebase Admin SDK JSON: missing project_id, client_email, or private_key.');
        return;
      }
      setIntegrations({
        ...integrations,
        firebase: {
          ...integrations.firebase,
          enabled: true,
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
          storageBucket: integrations.firebase.storageBucket || `${parsed.project_id}.firebasestorage.app`,
        },
      });
      setIntegrationNotice(`Loaded Firebase Admin JSON for ${parsed.project_id}. Click "Verify Firebase Admin" or "Save All Integrations".`);
    } catch {
      setIntegrationNotice('Could not parse JSON file. Select the Firebase service account JSON file.');
    }
    e.target.value = '';
  };

  const handleAdminLogout = () => {
    setAdminToken(null);
    setAuthedAdmin(null);
    setPassword('');
  };

  const handleUploadBuildZip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zipFile) {
      setUpdateNotice('Please choose a .zip file first.');
      return;
    }
    setZipUpdating(true);
    setUpdateNotice(null);
    setUpdateResult(null);
    try {
      const res = await api.adminUploadBuildZip(zipFile, {
        runBuild: runBuildMode,
        restartAfterUpdate,
      });
      setUpdateResult(res);
      setUpdateNotice(
        `Update applied! ${res.extractedFilesCount} code files updated while preserving all ${res.persistence.counts.users} users and data.`
      );
      setZipFile(null);
      if (!res.restartScheduled) {
        await loadDashboardData();
      }
    } catch (err) {
      setUpdateNotice(`Update failed: ${(err as Error).message}`);
    } finally {
      setZipUpdating(false);
    }
  };

  const handleDownloadBackup = async () => {
    setUpdateNotice(null);
    try {
      const blob = await api.adminDownloadBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `muztalk-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setUpdateNotice('Full user & message backup downloaded.');
    } catch (err) {
      setUpdateNotice(`Backup download failed: ${(err as Error).message}`);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpdateNotice(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const res = await api.adminImportBackup(parsed);
      setUpdateNotice(
        `Backup merged successfully without deleting existing records (${res.persistence.counts.users} users, ${res.persistence.counts.messages} messages).`
      );
      await loadDashboardData();
    } catch (err) {
      setUpdateNotice(`Backup restore failed: ${(err as Error).message}`);
    }
    e.target.value = '';
  };

  if (!authedAdmin) {
    return (
      <div className="min-h-screen bg-[#F7FAFC] dark:bg-[#101820] flex flex-col">
        <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15202B] px-6 py-4 flex items-center justify-between">
          <MuzTalkLogo size={32} />
          <span className="text-xs font-semibold text-[#20BFA5]">
            Android App &amp; Admin Console Architecture
          </span>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 rounded-2xl p-8">
            <div className="flex items-center gap-2.5 text-[#20BFA5] text-xs font-semibold mb-2">
              <Lock className="w-4 h-4" />
              <span>MuzTalk Administration</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-[#101C35] dark:text-white">
              {needsBootstrap ? 'Claim First-Run Admin Account' : 'Admin Console Sign In'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">
              {needsBootstrap
                ? 'Set up the initial Super Admin password. Once claimed, this setup form locks permanently.'
                : 'Sign in with your administrator credentials. Private encrypted user messages are never exposed here.'}
            </p>

            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm text-[#101C35] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                />
              </div>

              {needsBootstrap && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm text-[#101C35] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Password {needsBootstrap ? '(min 8 characters)' : ''}
                </label>
                <input
                  type="password"
                  required
                  minLength={needsBootstrap ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm text-[#101C35] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 px-4 rounded-xl bg-[#101C35] dark:bg-[#20BFA5] hover:opacity-95 text-white font-semibold text-sm transition-opacity min-h-[44px]"
              >
                {authLoading ? 'Authenticating...' : needsBootstrap ? 'Initialize Admin Account' : 'Sign In to Console'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'infrastructure', label: 'System Health', icon: <Server className="w-4 h-4" /> },
    { id: 'integrations', label: 'Integrations & DB', icon: <Sliders className="w-4 h-4" /> },
    { id: 'updates', label: 'Update & Backup', icon: <UploadCloud className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit Logs', icon: <FileText className="w-4 h-4" /> },
    { id: 'config', label: 'Configuration', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F7FAFC] dark:bg-[#101820] text-[#101C35] dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Left Sidebar (250px) */}
      <aside className="w-full lg:w-[250px] shrink-0 bg-white dark:bg-[#15202B] border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between">
        <div>
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <MuzTalkLogo size={30} />
          </div>
          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                  tab === item.id
                    ? 'bg-[#20BFA5]/12 text-[#169681] dark:text-[#48D6B8]'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 hidden lg:block space-y-2">
          <div className="text-xs font-semibold truncate">{authedAdmin.displayName}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {authedAdmin.email} · {authedAdmin.role}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onBackToApp}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Messenger
            </button>
            <button
              type="button"
              onClick={handleAdminLogout}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              aria-label="Admin logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white dark:bg-[#15202B] border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between gap-4">
          <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>MuzTalk Admin</span>
            <span>/</span>
            <span className="font-semibold text-[#101C35] dark:text-white capitalize">{tab}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadDashboardData}
              className="px-3.5 py-2 rounded-lg bg-[#20BFA5] hover:bg-[#1aa891] text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              {dataLoading ? 'Refreshing...' : 'Refresh Metrics'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
          {tab === 'overview' && health && (
            <>
              {/* MySQL 8 Status Notice */}
              <div className="p-4 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-[#20BFA5] shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">
                      Primary Database: MySQL 8 ({health.database.connected ? `Connected v${health.database.version}` : 'Preview Memory Mode — Configure DATABASE_URL for MySQL 8'})
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Prisma MySQL schema ready with 34 normalized InnoDB utf8mb4_unicode_ci tables.
                    </div>
                  </div>
                </div>
                <span className={`text-xs font-semibold ${health.database.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {health.database.connected ? 'MySQL Active' : 'Pending MySQL Host'}
                </span>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Users', value: health.metrics.totalUsers, sub: `${health.metrics.activeUsers} active` },
                  { label: 'Online Now', value: health.metrics.onlineUsers, sub: 'Live Socket.IO' },
                  { label: 'Total Messages', value: health.metrics.totalMessages, sub: 'Encrypted metadata only' },
                  { label: 'Groups & Calls', value: health.metrics.totalGroups, sub: `${health.metrics.totalCalls} logged calls` },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="p-5 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800"
                  >
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</div>
                    <div className="font-display text-3xl font-bold mt-2 tabular-nums">{kpi.value}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{kpi.sub}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'users' && (
            <div className="bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name, @username, or phone..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101820] text-sm focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                  />
                </div>
                <span className="text-xs text-slate-500 tabular-nums">{users.length} accounts</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-3 px-4 font-medium">User</th>
                      <th className="py-3 px-4 font-medium">Phone</th>
                      <th className="py-3 px-4 font-medium">Presence</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <UserAvatar src={u.avatarUrl} name={u.displayName} size="sm" />
                            <div>
                              <div className="font-medium">{u.displayName}</div>
                              <div className="text-xs text-slate-400">@{u.username || 'unassigned'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums">{u.phoneNumber}</td>
                        <td className="py-3 px-4 text-xs text-slate-500">
                          {u.isOnline ? 'Online' : 'Offline'}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold">
                          <span className={u.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleUserScreenCapture(u)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                u.blockScreenCapture || config?.blockScreenCapture
                                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {u.blockScreenCapture ? 'Capture Blocked' : 'Block Capture'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(u)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'reports' && (
            <div className="bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              {reports.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No moderation reports submitted.</div>
              ) : (
                reports.map((r) => (
                  <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold">{r.reason}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Reported: {r.reportedUserName} · By: {r.reporterName} · Status: {r.status}
                      </div>
                      {r.details && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{r.details}</p>}
                    </div>
                    {r.status === 'OPEN' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResolveReport(r.id, 'RESOLVED')}
                          className="px-3 py-1.5 rounded-lg bg-[#20BFA5] text-white text-xs font-semibold"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveReport(r.id, 'DISMISSED')}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'infrastructure' && health && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: 'MySQL 8 Database', status: health.database.connected ? 'Connected' : 'Pending DATABASE_URL', ok: health.database.connected },
                { name: 'Express REST API', status: health.services.expressApi, ok: true },
                { name: 'Socket.IO Real-Time Hub', status: health.services.socketIo, ok: true },
                { name: 'Coturn STUN/TURN Relay', status: health.services.coturn, ok: true },
                { name: 'LiveKit SFU Group Calls', status: health.services.livekitSfu, ok: health.services.livekitSfu === 'configured' },
                { name: 'Firebase Cloud Messaging', status: health.services.fcmPush, ok: health.services.fcmPush === 'configured' },
                { name: 'Mobile Encrypted Vault Storage', status: health.services.objectStorage, ok: true },
              ].map((svc) => (
                <div
                  key={svc.name}
                  className="p-4 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                >
                  <span className="text-sm font-medium">{svc.name}</span>
                  <span className={`text-xs font-mono flex items-center gap-1.5 ${svc.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {svc.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === 'integrations' && integrations && (
            <form onSubmit={handleSaveIntegrations} className="space-y-6">
              {integrationNotice && (
                <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-sm text-teal-900 dark:text-teal-200">
                  {integrationNotice}
                </div>
              )}

              {/* Domains & Mobile Encrypted Folder Storage */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 space-y-4">
                <h3 className="text-sm font-bold">Domains & Mobile Encrypted Storage (AES-256-GCM)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Backend API URL</label>
                    <input
                      type="text"
                      value={integrations.domains.backendApiUrl}
                      onChange={(e) => setIntegrations({ ...integrations, domains: { ...integrations.domains, backendApiUrl: e.target.value } })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Admin Panel URL</label>
                    <input
                      type="text"
                      value={integrations.domains.frontendUrl}
                      onChange={(e) => setIntegrations({ ...integrations, domains: { ...integrations.domains, frontendUrl: e.target.value } })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Storage Mode</label>
                    <select
                      value={integrations.storage.mode}
                      onChange={(e) => setIntegrations({
                        ...integrations,
                        storage: { ...integrations.storage, mode: e.target.value as 'mobile_encrypted_vault' | 'server_temp_relay' },
                      })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm"
                    >
                      <option value="mobile_encrypted_vault">Mobile Encrypted Folder (AES-256-GCM)</option>
                      <option value="server_temp_relay">Temporary Server Relay</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Mobile Folder Name</label>
                    <input
                      type="text"
                      value={integrations.storage.folderName}
                      onChange={(e) => setIntegrations({
                        ...integrations,
                        storage: { ...integrations.storage, folderName: e.target.value },
                      })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Encryption Standard</label>
                    <input
                      type="text"
                      readOnly
                      value="AES-256-GCM (Android Keystore)"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101820] text-sm text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* MySQL 8 Database */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-bold">MySQL 8 Database</h3>
                  <button
                    type="button"
                    onClick={handleTestMysql}
                    className="px-3 py-1.5 rounded-lg border border-[#20BFA5] text-[#20BFA5] text-xs font-semibold"
                  >
                    Test & Connect MySQL
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="MySQL Host (e.g. 127.0.0.1)"
                    value={integrations.mysql.host}
                    onChange={(e) => setIntegrations({ ...integrations, mysql: { ...integrations.mysql, host: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Port (3306)"
                    value={integrations.mysql.port}
                    onChange={(e) => setIntegrations({ ...integrations, mysql: { ...integrations.mysql, port: Number(e.target.value || 3306) } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Database Name (muztalk)"
                    value={integrations.mysql.database}
                    onChange={(e) => setIntegrations({ ...integrations, mysql: { ...integrations.mysql, database: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="text"
                    placeholder="MySQL Username"
                    value={integrations.mysql.user}
                    onChange={(e) => setIntegrations({ ...integrations, mysql: { ...integrations.mysql, user: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="password"
                    placeholder={integrations.mysql.passwordSet ? 'Password saved (leave blank to keep)' : 'MySQL Password'}
                    value={integrations.mysql.password || ''}
                    onChange={(e) => setIntegrations({ ...integrations, mysql: { ...integrations.mysql, password: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="password"
                    placeholder={integrations.mysql.connectionUrlSet ? 'Connection URI saved' : 'mysql://user:pass@host:3306/muztalk'}
                    value={integrations.mysql.connectionUrl || ''}
                    onChange={(e) => setIntegrations({ ...integrations, mysql: { ...integrations.mysql, connectionUrl: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                </div>
              </div>

              {/* SMTP Email OTP */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold">SMTP Mail OTP (Primary Login)</h3>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={integrations.smtp.enabled}
                        onChange={(e) => setIntegrations({ ...integrations, smtp: { ...integrations.smtp, enabled: e.target.checked } })}
                      />
                      Enabled
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      placeholder="Test recipient email"
                      value={smtpTestEmail}
                      onChange={(e) => setSmtpTestEmail(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleTestSmtp}
                      className="px-3 py-1.5 rounded-lg border border-[#20BFA5] text-[#20BFA5] text-xs font-semibold"
                    >
                      Test SMTP
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="SMTP Host (e.g. smtp.gmail.com)"
                    value={integrations.smtp.host}
                    onChange={(e) => setIntegrations({ ...integrations, smtp: { ...integrations.smtp, host: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Port (587 or 465)"
                    value={integrations.smtp.port}
                    onChange={(e) => setIntegrations({ ...integrations, smtp: { ...integrations.smtp, port: Number(e.target.value || 587) } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <label className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                    <input
                      type="checkbox"
                      checked={integrations.smtp.secure}
                      onChange={(e) => setIntegrations({ ...integrations, smtp: { ...integrations.smtp, secure: e.target.checked } })}
                    />
                    Use TLS / SSL (port 465)
                  </label>
                  <input
                    type="text"
                    placeholder="SMTP Username"
                    value={integrations.smtp.user}
                    onChange={(e) => setIntegrations({ ...integrations, smtp: { ...integrations.smtp, user: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="password"
                    placeholder={integrations.smtp.passSet ? 'SMTP Password saved' : 'SMTP Password / App Password'}
                    value={integrations.smtp.pass || ''}
                    onChange={(e) => setIntegrations({ ...integrations, smtp: { ...integrations.smtp, pass: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="email"
                    placeholder="From Email"
                    value={integrations.smtp.fromEmail}
                    onChange={(e) => setIntegrations({ ...integrations, smtp: { ...integrations.smtp, fromEmail: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                </div>
              </div>

              {/* Optional Twilio & Firebase */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">Twilio SMS (Optional)</h3>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={integrations.twilio.enabled}
                        onChange={(e) => setIntegrations({ ...integrations, twilio: { ...integrations.twilio, enabled: e.target.checked } })}
                      />
                      Enabled
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="Twilio Account SID"
                    value={integrations.twilio.accountSid}
                    onChange={(e) => setIntegrations({ ...integrations, twilio: { ...integrations.twilio, accountSid: e.target.value } })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="password"
                    placeholder={integrations.twilio.authTokenSet ? 'Auth Token saved' : 'Twilio Auth Token'}
                    value={integrations.twilio.authToken || ''}
                    onChange={(e) => setIntegrations({ ...integrations, twilio: { ...integrations.twilio, authToken: e.target.value } })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Twilio From Number (+1...)"
                    value={integrations.twilio.fromNumber}
                    onChange={(e) => setIntegrations({ ...integrations, twilio: { ...integrations.twilio, fromNumber: e.target.value } })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                </div>

                <div className="p-5 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">Firebase Admin SDK (FCM Push)</h3>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={integrations.firebase.enabled}
                          onChange={(e) => setIntegrations({ ...integrations, firebase: { ...integrations.firebase, enabled: e.target.checked } })}
                        />
                        Enabled
                      </label>
                      <button
                        type="button"
                        onClick={handleTestFirebase}
                        className="px-3 py-1 rounded-lg border border-[#20BFA5] text-[#20BFA5] text-xs font-semibold"
                      >
                        Verify Firebase Admin
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-[#101820] border border-slate-200 dark:border-slate-700 text-xs">
                    <span className="text-slate-600 dark:text-slate-300">
                      Load <code className="font-mono">firebase-adminsdk-*.json</code> directly:
                    </span>
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={handleFirebaseJsonFile}
                      className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:bg-[#20BFA5] file:text-white file:font-semibold file:cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Firebase Project ID"
                    value={integrations.firebase.projectId}
                    onChange={(e) => setIntegrations({ ...integrations, firebase: { ...integrations.firebase, projectId: e.target.value } })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Storage Bucket"
                    value={integrations.firebase.storageBucket}
                    onChange={(e) => setIntegrations({ ...integrations, firebase: { ...integrations.firebase, storageBucket: e.target.value } })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Firebase Service Account Client Email"
                    value={integrations.firebase.clientEmail}
                    onChange={(e) => setIntegrations({ ...integrations, firebase: { ...integrations.firebase, clientEmail: e.target.value } })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <textarea
                    rows={3}
                    placeholder={
                      integrations.firebase.privateKeySet
                        ? 'Private key saved securely on server (leave blank to keep existing key)'
                        : '-----BEGIN PRIVATE KEY----- ...'
                    }
                    value={integrations.firebase.privateKey || ''}
                    onChange={(e) => setIntegrations({ ...integrations, firebase: { ...integrations.firebase, privateKey: e.target.value } })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-mono"
                  />
                </div>
              </div>

              {/* WebRTC STUN/TURN & LiveKit */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-sm font-bold">WebRTC Coturn & LiveKit SFU</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="STUN URL"
                    value={integrations.calls.stunServerUrl}
                    onChange={(e) => setIntegrations({ ...integrations, calls: { ...integrations.calls, stunServerUrl: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="text"
                    placeholder="TURN URL"
                    value={integrations.calls.turnServerUrl}
                    onChange={(e) => setIntegrations({ ...integrations, calls: { ...integrations.calls, turnServerUrl: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                  <input
                    type="text"
                    placeholder="LiveKit WS URL"
                    value={integrations.calls.livekitUrl}
                    onChange={(e) => setIntegrations({ ...integrations, calls: { ...integrations.calls, livekitUrl: e.target.value } })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="px-6 py-3 rounded-xl bg-[#20BFA5] hover:bg-[#1aa891] text-white font-semibold text-sm"
              >
                Save All Integrations
              </button>
            </form>
          )}

          {tab === 'updates' && (
            <div className="space-y-6">
              {updateNotice && (
                <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-sm text-teal-900 dark:text-teal-200">
                  {updateNotice}
                </div>
              )}

              {/* Persistent Data Guarantee Card */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <HardDrive className="w-5 h-5 text-[#20BFA5]" />
                    <div>
                      <h3 className="text-sm font-bold">Zero-Loss Data Persistence</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Old users, chats, messages, admins, and uploads are stored safely outside app code updates.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Protected
                  </span>
                </div>

                {persistence && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#101820] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">Preserved Users</div>
                      <div className="font-bold text-base mt-0.5 tabular-nums">{persistence.counts.users}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#101820] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">Messages</div>
                      <div className="font-bold text-base mt-0.5 tabular-nums">{persistence.counts.messages}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#101820] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">Groups & Calls</div>
                      <div className="font-bold text-base mt-0.5 tabular-nums">
                        {persistence.counts.groups} / {persistence.counts.calls}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#101820] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-500">MySQL Sync</div>
                      <div className="font-bold text-sm mt-1">
                        {persistence.mysqlConnected ? `Active v${persistence.mysqlVersion}` : 'Snapshot Active'}
                      </div>
                    </div>
                  </div>
                )}

                {persistence && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono break-all pt-1">
                    Persistent Data Dir: {persistence.dataDir}
                  </div>
                )}
              </div>

              {/* Upload New Build ZIP Card */}
              <form
                onSubmit={handleUploadBuildZip}
                className="p-5 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <div className="flex items-center gap-2.5">
                  <PackageCheck className="w-5 h-5 text-[#20BFA5]" />
                  <div>
                    <h3 className="text-sm font-bold">Upload New Build (.zip) Without Losing Old Data</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Upload a new MuzTalk source or production ZIP directly here. Protected paths (<code className="font-mono">.env</code>, <code className="font-mono">data/</code>, <code className="font-mono">uploads/</code>, <code className="font-mono">node_modules/</code>) and MySQL users are never cleared.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#101820]">
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                    className="w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#20BFA5] file:text-white file:font-semibold file:cursor-pointer"
                  />
                  {zipFile && (
                    <div className="mt-2 text-xs text-[#20BFA5] font-medium">
                      Selected: {zipFile.name} ({(zipFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Build Handling</label>
                    <select
                      value={runBuildMode}
                      onChange={(e) => setRunBuildMode(e.target.value as 'auto' | 'true' | 'false')}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm"
                    >
                      <option value="auto">Auto (Build only if ZIP has src/ without dist/)</option>
                      <option value="true">Always run npm run build after extract</option>
                      <option value="false">Extract only (ZIP already has dist/ + server.js)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2.5 text-xs px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 self-end">
                    <input
                      type="checkbox"
                      checked={restartAfterUpdate}
                      onChange={(e) => setRestartAfterUpdate(e.target.checked)}
                    />
                    <span>Restart Node.js process immediately after update (recommended on Hostinger/PM2)</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={!zipFile || zipUpdating}
                  className="px-5 py-2.5 rounded-xl bg-[#20BFA5] hover:bg-[#1aa891] disabled:opacity-50 text-white font-semibold text-sm flex items-center gap-2"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>{zipUpdating ? 'Updating Code & Preserving Data...' : 'Upload & Apply Build ZIP'}</span>
                </button>

                {updateResult && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#101820] border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                    <div className="font-semibold text-[#20BFA5]">Update Summary</div>
                    <div>Files extracted: {updateResult.extractedFilesCount}</div>
                    <div>Protected entries skipped: {updateResult.skippedProtectedCount}</div>
                    <div>Production build executed: {updateResult.buildRan ? 'Yes' : 'No (pre-built or skipped)'}</div>
                    <div>Hostinger public_html synced: {updateResult.syncedPublicHtml ? 'Yes' : 'No'}</div>
                    <div>Restart marker (tmp/restart.txt): {updateResult.restartTriggered ? 'Written' : 'N/A'}</div>
                    <div>Preserved users after update: {updateResult.persistence.counts.users}</div>
                  </div>
                )}
              </form>

              {/* Full JSON Backup & Merge Restore */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 space-y-4">
                <h3 className="text-sm font-bold">Full Data Backup & Merge Restore (.json)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Download a complete backup of all users, chats, groups, settings, and admin accounts before server migrations, or merge an older backup file without clearing current users.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    className="px-4 py-2.5 rounded-xl bg-[#101C35] dark:bg-[#20BFA5] text-white text-xs font-semibold flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Backup (.json)</span>
                  </button>

                  <label className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                    <span>Import / Merge Backup (.json)</span>
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={handleImportBackup}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {tab === 'audit' && (
            <div className="bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No audit log events recorded yet.</div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <span className="font-mono font-semibold">{log.action}</span>
                      <span className="text-slate-400 mx-2">·</span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {log.adminEmail} ({log.targetType})
                      </span>
                    </div>
                    <span className="font-mono text-slate-400 tabular-nums shrink-0">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'config' && config && (
            <div className="bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              {[
                { key: 'blockScreenCapture' as const, title: 'Block Screenshots & Screen Recording (All Users)', desc: 'Enforces native FLAG_SECURE on Android and capture protection on Web for all users.' },
                { key: 'allowNewRegistrations' as const, title: 'Allow New Registrations', desc: 'Control whether new email/phone accounts can sign up via OTP.' },
                { key: 'e2eeEnforced' as const, title: 'Enforce E2EE Key Bundles', desc: 'Require ECDH identity keys on all active chat devices.' },
                { key: 'maintenanceMode' as const, title: 'Maintenance Mode', desc: 'Temporarily pause non-admin message routing.' },
              ].map((item) => (
                <div key={item.key} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleConfig(item.key)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      config[item.key]
                        ? 'bg-[#20BFA5] text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {config[item.key] ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

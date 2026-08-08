import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { createPublicBranch } from '../../chats/api/chatApi.js';
import {
  deleteAdminSystemBotMessage,
  editAdminSystemBotMessage,
  getAdminAuditLogs,
  getAdminBranches,
  getAdminMaintenance,
  getAdminOverview,
  getAdminSecurityMetrics,
  getAdminSystemBot,
  getAdminUser,
  getAdminUsers,
  publishAdminSystemBotMessage,
  runAdminRetention,
  setAdminBranchArchived,
  setAdminBranchMember,
  toggleAdminSystemBotMessagePin,
  updateAdminBranch,
  updateAdminUserStatus,
  updateAdminUserVpnStatus,
} from '../api/adminApi.js';

const TABS = ['overview', 'systemBot', 'users', 'branches', 'maintenance', 'audit'];
const EMPTY_BRANCH_FORM = { title: '', slug: '', description: '', avatar_ref: '📢' };

function AdminIcon({ name, size = 20 }) {
  const paths = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    users: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7" r="4" /><path d="M22 20v-1.5a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    branches: <><path d="M4 20V4m0 3h9l-1 4 4 2H4" /><path d="M4 20h16" /></>,
    maintenance: <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5" /><path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" /></>,
    systemBot: <><rect x="4" y="5" width="16" height="14" rx="4" /><path d="M9 5V3m6 2V3M8.5 12h.01M15.5 12h.01M9 16h6" /></>,
    audit: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    shield: <><path d="M12 3 4 6v5c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10V6l-8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-14.4-4.8L4 8" /><path d="M4 4v4h4M4 13a8.1 8.1 0 0 0 14.4 4.8L20 16" /><path d="M20 20v-4h-4" /></>,
    arrow: <path d="m9 18 6-6-6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></>,
    filter: <><path d="M4 6h16M7 12h10m-7 6h4" /></>,
    send: <><path d="m21 3-8.5 18-2.3-7.2L3 11.2 21 3Z" /><path d="m10.2 13.8 4.2-4.2" /></>,
    pin: <><path d="M8 4h8l-1 6 3 3v2H6v-2l3-3-1-6Z" /><path d="M12 15v6" /></>,
    pencil: <><path d="m14.5 5.5 4 4M4.5 19.5l3.2-.7 10.8-10.8a2.8 2.8 0 0 0-4-4L3.7 14.8l-.7 4.7Z" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
  };
  return <svg className="admin-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function statusLabel(status, t) {
  return t(`admin.statuses.${status}`);
}

function actionLabel(action, t) {
  return t(`admin.auditActions.${action}`);
}

function formatDate(value, language) {
  return value ? new Date(value).toLocaleString(language) : '—';
}

function countryLabel(country) {
  return country === 'GLOBAL' ? 'Global' : country;
}

function formatBytes(value) {
  if (typeof value !== 'number' || value < 0) return '—';
  if (value < 1024) return `${value} Б`;
  const units = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

function storageLevel(percent) {
  if (typeof percent !== 'number') return 'unknown';
  if (percent >= 92) return 'critical';
  if (percent >= 85) return 'urgent';
  if (percent >= 70) return 'warning';
  return 'normal';
}

export function AdminPage() {
  const { language, t } = useI18n();
  const { session } = useSession();
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [securityMetrics, setSecurityMetrics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ query: '', status: 'all', country: '', sort: 'newest' });
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false);
  const userDetailsRequestId = useRef(0);
  const [pendingAction, setPendingAction] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [branchStatus, setBranchStatus] = useState('');
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH_FORM);
  const [editingBranch, setEditingBranch] = useState(null);
  const [memberUserQuery, setMemberUserQuery] = useState('');
  const [memberRole, setMemberRole] = useState('admin');
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [systemBot, setSystemBot] = useState(null);
  const [isLoadingSystemBot, setIsLoadingSystemBot] = useState(false);
  const [systemBotPost, setSystemBotPost] = useState('');
  const [systemBotStatus, setSystemBotStatus] = useState('');
  const [isPublishingSystemBotPost, setIsPublishingSystemBotPost] = useState(false);
  const [editingSystemBotMessageId, setEditingSystemBotMessageId] = useState(null);
  const [editingSystemBotText, setEditingSystemBotText] = useState('');
  const [isUpdatingSystemBotMessage, setIsUpdatingSystemBotMessage] = useState(false);
  const [maintenance, setMaintenance] = useState(null);
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(false);
  const [isRunningRetention, setIsRunningRetention] = useState(false);
  const [maintenanceStatus, setMaintenanceStatus] = useState('');

  const countries = overview?.countries ?? [];
  const countryOptions = useMemo(() => countries.map((item) => item.country), [countries]);
  const navigationItems = TABS.map((tab) => ({ tab, icon: tab }));

  async function loadOverview() {
    setIsLoadingOverview(true);
    try {
      const [overviewData, metricsData, auditData] = await Promise.all([
        getAdminOverview(session.accessToken),
        getAdminSecurityMetrics(session.accessToken),
        getAdminAuditLogs(session.accessToken),
      ]);
      setOverview(overviewData);
      setSecurityMetrics(metricsData);
      setAuditLogs(auditData.entries);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingOverview(false);
    }
  }

  async function loadUsers(nextFilters = filters) {
    setIsLoadingUsers(true);
    try {
      const result = await getAdminUsers(session.accessToken, nextFilters);
      setUsers(result.users);
      setUsersTotal(result.total);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingUsers(false);
    }
  }

  async function loadBranches() {
    setIsLoadingBranches(true);
    try {
      const result = await getAdminBranches(session.accessToken);
      setBranches(result.branches);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingBranches(false);
    }
  }

  async function loadSystemBot() {
    setIsLoadingSystemBot(true);
    try {
      const result = await getAdminSystemBot(session.accessToken);
      setSystemBot(result);
      setSystemBotStatus('');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingSystemBot(false);
    }
  }

  async function loadMaintenance({ clearStatus = true } = {}) {
    setIsLoadingMaintenance(true);
    try {
      const result = await getAdminMaintenance(session.accessToken);
      setMaintenance(result);
      if (clearStatus) setMaintenanceStatus('');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingMaintenance(false);
    }
  }

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  useEffect(() => {
    if (activeTab !== 'users') return undefined;
    const timer = window.setTimeout(() => void loadUsers(), filters.query ? 300 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filters, session.accessToken]);

  useEffect(() => {
    if (activeTab === 'branches') void loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, session.accessToken]);

  useEffect(() => {
    if (activeTab === 'systemBot') void loadSystemBot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, session.accessToken]);

  useEffect(() => {
    if (activeTab === 'maintenance') void loadMaintenance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, session.accessToken]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function switchTab(tab) {
    setActiveTab(tab);
    setError('');
  }

  function openUserAction(user, status) {
    setPendingAction({ user, status });
    setDeleteConfirmation('');
  }

  function closeUserDetails() {
    userDetailsRequestId.current += 1;
    setSelectedUser(null);
  }

  async function openUserDetails(user) {
    const requestId = userDetailsRequestId.current + 1;
    userDetailsRequestId.current = requestId;
    setSelectedUser(user);
    setIsLoadingUserDetails(true);
    try {
      const userDetails = await getAdminUser(session.accessToken, user.id);
      if (userDetailsRequestId.current === requestId) setSelectedUser(userDetails);
    } catch (err) {
      if (userDetailsRequestId.current === requestId) {
        setSelectedUser(null);
        setError(err.message);
      }
    } finally {
      if (userDetailsRequestId.current === requestId) setIsLoadingUserDetails(false);
    }
  }

  async function confirmUserAction() {
    if (!pendingAction || (pendingAction.status === 'deleted' && deleteConfirmation !== t('admin.deleteConfirmWord'))) return;
    setIsUpdatingUser(true);
    try {
      await updateAdminUserStatus(session.accessToken, pendingAction.user.id, pendingAction.status);
      closeUserDetails();
      setPendingAction(null);
      await Promise.all([loadUsers(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUpdatingUser(false);
    }
  }

  async function toggleUserVpnStatus() {
    if (!selectedUser) return;
    setIsUpdatingUser(true);
    try {
      const result = await updateAdminUserVpnStatus(session.accessToken, selectedUser.id, !selectedUser.vpn_enabled);
      setSelectedUser((current) => (current ? { ...current, vpn_enabled: result.vpn_enabled } : current));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUpdatingUser(false);
    }
  }

  function updateBranchField(name, value) {
    setBranchForm((current) => ({ ...current, [name]: value }));
  }

  function normalizedBranchPayload() {
    return {
      ...branchForm,
      title: branchForm.title.trim(),
      slug: branchForm.slug.trim().toLowerCase(),
      description: branchForm.description.trim(),
      avatar_ref: branchForm.avatar_ref.trim() || null,
    };
  }

  async function createBranch(event) {
    event.preventDefault();
    const payload = normalizedBranchPayload();
    if (!/^[a-z0-9-]{3,64}$/.test(payload.slug)) {
      setBranchStatus(t('admin.branchSlugHint'));
      return;
    }
    setIsCreatingBranch(true);
    setBranchStatus('');
    try {
      await createPublicBranch(session.accessToken, payload);
      setBranchForm(EMPTY_BRANCH_FORM);
      setIsBranchDialogOpen(false);
      await Promise.all([loadBranches(), loadOverview()]);
    } catch (err) {
      setBranchStatus(err.message);
    } finally {
      setIsCreatingBranch(false);
    }
  }

  function openBranchEditor(branch) {
    setEditingBranch(branch);
    setBranchForm({ title: branch.title, slug: branch.slug, description: branch.description, avatar_ref: branch.avatar_ref || '' });
    setMemberUserQuery('');
    setMemberRole('admin');
    setBranchStatus('');
  }

  async function saveBranch(event) {
    event.preventDefault();
    if (!editingBranch) return;
    const payload = normalizedBranchPayload();
    if (!/^[a-z0-9-]{3,64}$/.test(payload.slug)) {
      setBranchStatus(t('admin.branchSlugHint'));
      return;
    }
    setIsSavingBranch(true);
    try {
      await updateAdminBranch(session.accessToken, editingBranch.id, payload);
      setEditingBranch(null);
      await Promise.all([loadBranches(), loadOverview()]);
    } catch (err) {
      setBranchStatus(err.message);
    } finally {
      setIsSavingBranch(false);
    }
  }

  async function toggleBranchArchive(branch) {
    try {
      await setAdminBranchArchived(session.accessToken, branch.id, !branch.is_archived);
      if (editingBranch?.id === branch.id) setEditingBranch(null);
      await Promise.all([loadBranches(), loadOverview()]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function assignBranchMember(event) {
    event.preventDefault();
    if (!editingBranch || !memberUserQuery.trim()) return;
    setIsSavingBranch(true);
    try {
      const result = await getAdminUsers(session.accessToken, { query: memberUserQuery.trim(), status: 'active', sort: 'name' });
      const identifier = memberUserQuery.trim().replace(/^@/, '').toLowerCase();
      const member = result.users.find((user) => user.username.toLowerCase() === identifier || user.nexus_id === identifier);
      if (!member) {
        setBranchStatus(t('admin.memberSearchExact'));
        return;
      }
      await setAdminBranchMember(session.accessToken, editingBranch.id, member.id, memberRole);
      setBranchStatus(t('admin.memberAssigned'));
      await Promise.all([loadBranches(), loadOverview()]);
    } catch (err) {
      setBranchStatus(err.message);
    } finally {
      setIsSavingBranch(false);
    }
  }

  async function publishSystemBotPost(event) {
    event.preventDefault();
    const text = systemBotPost.trim();
    if (!text) return;
    setIsPublishingSystemBotPost(true);
    try {
      await publishAdminSystemBotMessage(session.accessToken, { text });
      setSystemBotPost('');
      setSystemBotStatus(t('admin.systemBotPostPublished'));
      await Promise.all([loadSystemBot(), loadOverview()]);
    } catch (err) {
      setSystemBotStatus(err.message);
    } finally {
      setIsPublishingSystemBotPost(false);
    }
  }

  function startSystemBotMessageEdit(message) {
    setEditingSystemBotMessageId(message.id);
    setEditingSystemBotText(message.payload);
    setSystemBotStatus('');
  }

  async function saveSystemBotMessageEdit(messageId) {
    const text = editingSystemBotText.trim();
    if (!text) return;
    setIsUpdatingSystemBotMessage(true);
    try {
      await editAdminSystemBotMessage(session.accessToken, messageId, text);
      setEditingSystemBotMessageId(null);
      setEditingSystemBotText('');
      setSystemBotStatus(t('admin.systemBotPostUpdated'));
      await Promise.all([loadSystemBot(), loadOverview()]);
    } catch (err) {
      setSystemBotStatus(err.message);
    } finally {
      setIsUpdatingSystemBotMessage(false);
    }
  }

  async function updateSystemBotMessage(message, action) {
    setIsUpdatingSystemBotMessage(true);
    try {
      if (action === 'pin') await toggleAdminSystemBotMessagePin(session.accessToken, message.id);
      if (action === 'delete') await deleteAdminSystemBotMessage(session.accessToken, message.id);
      setSystemBotStatus(action === 'delete' ? t('admin.systemBotPostDeleted') : message.is_pinned ? t('admin.systemBotPostUnpinned') : t('admin.systemBotPostPinned'));
      await Promise.all([loadSystemBot(), loadOverview()]);
    } catch (err) {
      setSystemBotStatus(err.message);
    } finally {
      setIsUpdatingSystemBotMessage(false);
    }
  }

  async function runRetention() {
    if (!window.confirm(t('admin.maintenanceRunConfirm'))) return;
    setIsRunningRetention(true);
    try {
      await runAdminRetention(session.accessToken);
      setMaintenanceStatus(t('admin.maintenanceRunComplete'));
      await Promise.all([loadMaintenance({ clearStatus: false }), loadOverview()]);
    } catch (err) {
      setMaintenanceStatus(err.message);
    } finally {
      setIsRunningRetention(false);
    }
  }

  if (isLoadingOverview && !overview) {
    return <main className="admin-page"><section className="admin-loading"><AraChatLoader title={t('admin.loadingTitle')} text={t('admin.loadingText')} /></section></main>;
  }

  return (
    <main className="admin-page">
      <section className="admin-control-room">
        <header className="admin-topbar">
          <Link to="/app" className="admin-brand" aria-label="AraChat Control">
            <span className="admin-brand-mark"><AdminIcon name="shield" /></span>
            <span><strong>AraChat</strong><small>Control Room</small></span>
          </Link>
          <div className="admin-topbar-actions">
            <span className="admin-secure-indicator"><span />{t('admin.secureAccess')}</span>
            <Link to="/app" className="admin-exit-link"><span>{t('admin.backToMessenger')}</span><AdminIcon name="external" size={16} /></Link>
          </div>
        </header>

        <div className="admin-layout">
          <aside className="admin-sidebar" aria-label={t('admin.navigation')}>
            <p>{t('admin.navigation')}</p>
            <nav>
              {navigationItems.map(({ tab, icon }) => (
                <button className={activeTab === tab ? 'active' : ''} type="button" key={tab} onClick={() => switchTab(tab)}>
                  <AdminIcon name={icon} />
                  <span>{t(`admin.tabs.${tab}`)}</span>
                  {tab === 'audit' && auditLogs.length ? <small>{auditLogs.length}</small> : null}
                </button>
              ))}
            </nav>
            <div className="admin-sidebar-footer">
              <AdminIcon name="shield" size={17} />
              <span>{t('admin.controlFooter')}</span>
            </div>
          </aside>

          <section className="admin-content" aria-live="polite">
            {error ? <div className="admin-error"><span>!</span><p>{error}</p><button type="button" onClick={() => setError('')} aria-label={t('common.close')}><AdminIcon name="close" size={16} /></button></div> : null}

            {activeTab === 'overview' ? (
              <>
                <header className="admin-page-heading">
                  <div><p className="eyebrow">AraChat Control</p><h1>{t('admin.overviewTitle')}</h1><p>{t('admin.overviewText')}</p></div>
                  <button className="admin-icon-button" type="button" onClick={() => void loadOverview()} aria-label={t('admin.refresh')} title={t('admin.refresh')}><AdminIcon name="refresh" /></button>
                </header>
                <div className="admin-metric-grid">
                  <article><span className="admin-metric-icon users"><AdminIcon name="users" /></span><p>{t('admin.totalUsers')}</p><strong>{overview?.total_users ?? 0}</strong></article>
                  <article><span className="admin-metric-icon active"><AdminIcon name="overview" /></span><p>{t('admin.activeUsers')}</p><strong>{overview?.active_users ?? 0}</strong></article>
                  <article><span className="admin-metric-icon warning"><AdminIcon name="shield" /></span><p>{t('admin.blockedUsers')}</p><strong>{securityMetrics?.blocked_users ?? 0}</strong></article>
                  <article><span className="admin-metric-icon sessions"><AdminIcon name="audit" /></span><p>{t('admin.activeSessions')}</p><strong>{securityMetrics?.active_sessions ?? 0}</strong></article>
                </div>
                <div className="admin-overview-grid">
                  <section className="admin-surface admin-activity-card"><header><div><h2>{t('admin.recentActivity')}</h2><p>{t('admin.auditText')}</p></div><button type="button" onClick={() => switchTab('audit')}>{t('admin.viewAll')}<AdminIcon name="arrow" size={16} /></button></header>{auditLogs.length ? <ol className="admin-activity-list">{auditLogs.slice(0, 5).map((entry) => <li key={entry.id}><span className="admin-activity-dot" /><div><strong>{actionLabel(entry.action, t)}</strong><small>{formatDate(entry.created_at, language)}</small></div></li>)}</ol> : <p className="admin-empty-state">{t('admin.auditEmpty')}</p>}</section>
                  <section className="admin-surface admin-quick-card"><h2>{t('admin.quickActions')}</h2><div className="admin-quick-actions"><button type="button" onClick={() => switchTab('systemBot')}><span><AdminIcon name="systemBot" /></span><div><strong>{t('admin.systemBotQuickAction')}</strong><small>{t('admin.systemBotQuickActionText')}</small></div><AdminIcon name="arrow" size={16} /></button><button type="button" onClick={() => { setBranchForm(EMPTY_BRANCH_FORM); setBranchStatus(''); setIsBranchDialogOpen(true); }}><span><AdminIcon name="plus" /></span><div><strong>{t('admin.createBranch')}</strong><small>{t('admin.createBranchText')}</small></div><AdminIcon name="arrow" size={16} /></button><button type="button" onClick={() => switchTab('users')}><span><AdminIcon name="search" /></span><div><strong>{t('admin.findUser')}</strong><small>{t('admin.findUserText')}</small></div><AdminIcon name="arrow" size={16} /></button></div></section>
                  <section className="admin-surface admin-security-card"><header><div><h2>{t('admin.securityTitle')}</h2><p>{t('admin.securityText')}</p></div><AdminIcon name="shield" /></header><div className="admin-security-list"><div><span>{t('admin.lockedPasswords')}</span><strong>{securityMetrics?.locked_passwords ?? 0}</strong></div><div><span>{t('admin.lockedPins')}</span><strong>{securityMetrics?.locked_pins ?? 0}</strong></div><div><span>{t('admin.archivedBranches')}</span><strong>{securityMetrics?.archived_branches ?? 0}</strong></div></div></section>
                  <section className="admin-surface admin-country-card"><header><div><h2>{t('admin.registrationCountries')}</h2><p>{t('admin.countryDistribution')}</p></div></header><div className="admin-country-bars">{countries.map((item) => <div key={item.country}><span>{countryLabel(item.country)}</span><i><b style={{ width: `${Math.max(8, ((item.count / Math.max(overview?.total_users || 1, 1)) * 100))}%` }} /></i><strong>{item.count}</strong></div>)}</div></section>
                </div>
              </>
            ) : null}

            {activeTab === 'systemBot' ? (
              <>
                <header className="admin-page-heading">
                  <div><p className="eyebrow">AraChat System</p><h1>{t('admin.systemBotTitle')}</h1><p>{t('admin.systemBotText')}</p></div>
                  <button className="admin-icon-button" type="button" onClick={() => void loadSystemBot()} aria-label={t('admin.refresh')} title={t('admin.refresh')}><AdminIcon name="refresh" /></button>
                </header>
                {isLoadingSystemBot && !systemBot ? <AraChatLoader title={t('admin.systemBotTitle')} text={t('admin.loadingSystemBot')} /> : (
                  <div className="system-bot-layout">
                    <section className="system-bot-composer admin-surface">
                      <div className="system-bot-profile">
                        <span className="system-bot-avatar">{systemBot?.branch?.avatar_ref || '📣'}</span>
                        <div><div className="system-bot-name"><h2>{systemBot?.branch?.title || 'Ara Updates'}</h2><span>✓</span></div><p>#{systemBot?.branch?.slug || 'ara-updates'} · {t('admin.subscribers').replace('{count}', String(systemBot?.branch?.subscriber_count ?? 0))}</p></div>
                        {systemBot?.branch ? <button className="system-bot-settings-button" type="button" onClick={() => openBranchEditor(systemBot.branch)}><AdminIcon name="pencil" size={15} />{t('admin.systemBotSettings')}</button> : null}
                      </div>
                      <form onSubmit={publishSystemBotPost}>
                        <label className="field"><span>{t('admin.systemBotNewPost')}</span><textarea className="text-input" value={systemBotPost} maxLength="4000" placeholder={t('admin.systemBotPostPlaceholder')} onChange={(event) => setSystemBotPost(event.target.value)} /></label>
                        <div className="system-bot-composer-actions"><small>{systemBotPost.trim().length}/4000</small><Button type="submit" disabled={!systemBotPost.trim() || isPublishingSystemBotPost}><AdminIcon name="send" size={17} />{isPublishingSystemBotPost ? t('admin.systemBotPublishing') : t('admin.systemBotPublish')}</Button></div>
                      </form>
                      {systemBotStatus ? <p className={systemBotStatus === t('admin.systemBotPostPublished') || systemBotStatus === t('admin.systemBotPostUpdated') || systemBotStatus === t('admin.systemBotPostPinned') || systemBotStatus === t('admin.systemBotPostUnpinned') || systemBotStatus === t('admin.systemBotPostDeleted') ? 'success-text system-bot-status' : 'error-text system-bot-status'}>{systemBotStatus}</p> : null}
                    </section>
                    <section className="system-bot-posts admin-surface">
                      <header><div><h2>{t('admin.systemBotPosts')}</h2><p>{t('admin.systemBotPostsText')}</p></div><span className="system-bot-post-count">{systemBot?.messages?.filter((message) => !message.deleted_at).length ?? 0}</span></header>
                      <div className="system-bot-post-list">
                        {systemBot?.messages?.filter((message) => !message.deleted_at).slice().reverse().map((message) => (
                          <article className={`system-bot-post ${message.is_pinned ? 'pinned' : ''}`} key={message.id}>
                            <div className="system-bot-post-head"><div><span className="system-bot-post-icon"><AdminIcon name={message.is_pinned ? 'pin' : 'systemBot'} size={16} /></span><time>{formatDate(message.created_at, language)}{message.edited_at ? ` · ${t('admin.systemBotEdited')}` : ''}</time></div><div className="system-bot-post-actions"><button type="button" onClick={() => void updateSystemBotMessage(message, 'pin')} disabled={isUpdatingSystemBotMessage} title={message.is_pinned ? t('admin.systemBotUnpin') : t('admin.systemBotPin')} aria-label={message.is_pinned ? t('admin.systemBotUnpin') : t('admin.systemBotPin')}><AdminIcon name="pin" size={16} /></button><button type="button" onClick={() => startSystemBotMessageEdit(message)} disabled={isUpdatingSystemBotMessage} title={t('admin.edit')} aria-label={t('admin.edit')}><AdminIcon name="pencil" size={16} /></button><button className="danger" type="button" onClick={() => void updateSystemBotMessage(message, 'delete')} disabled={isUpdatingSystemBotMessage} title={t('admin.delete')} aria-label={t('admin.delete')}><AdminIcon name="trash" size={16} /></button></div></div>
                            {editingSystemBotMessageId === message.id ? <div className="system-bot-edit"><textarea className="text-input" value={editingSystemBotText} maxLength="4000" onChange={(event) => setEditingSystemBotText(event.target.value)} /><div><Button type="button" variant="secondary" onClick={() => { setEditingSystemBotMessageId(null); setEditingSystemBotText(''); }}>{t('messages.cancel')}</Button><Button type="button" onClick={() => void saveSystemBotMessageEdit(message.id)} disabled={!editingSystemBotText.trim() || isUpdatingSystemBotMessage}>{t('admin.systemBotSavePost')}</Button></div></div> : <p>{message.payload}</p>}
                          </article>
                        ))}
                        {!systemBot?.messages?.some((message) => !message.deleted_at) ? <p className="admin-empty-state">{t('admin.systemBotNoPosts')}</p> : null}
                      </div>
                    </section>
                  </div>
                )}
              </>
            ) : null}

            {activeTab === 'users' ? (
              <>
                <header className="admin-page-heading"><div><p className="eyebrow">{t('admin.tabs.users')}</p><h1>{t('admin.usersTitle')}</h1><p>{t('admin.usersFound').replace('{count}', String(usersTotal))}</p></div><button className="admin-icon-button" type="button" onClick={() => void loadUsers()} aria-label={t('admin.refresh')} title={t('admin.refresh')}><AdminIcon name="refresh" /></button></header>
                <section className="admin-surface admin-user-tools"><div className="admin-search-input"><AdminIcon name="search" size={18} /><input value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} placeholder={t('admin.searchPlaceholder')} aria-label={t('admin.search')} /></div><div className="admin-filter-group"><span><AdminIcon name="filter" size={16} />{t('admin.filters')}</span><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} aria-label={t('admin.status')}><option value="all">{t('admin.allStatuses')}</option><option value="active">{statusLabel('active', t)}</option><option value="blocked">{statusLabel('blocked', t)}</option><option value="deleted">{statusLabel('deleted', t)}</option></select><select value={filters.country} onChange={(event) => updateFilter('country', event.target.value)} aria-label={t('admin.country')}><option value="">{t('admin.allCountries')}</option>{countryOptions.map((country) => <option key={country} value={country}>{countryLabel(country)}</option>)}</select><select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)} aria-label={t('admin.sort')}><option value="newest">{t('admin.sortOptions.newest')}</option><option value="oldest">{t('admin.sortOptions.oldest')}</option><option value="name">{t('admin.sortOptions.name')}</option></select></div></section>
                <section className="admin-user-table admin-surface"><div className="admin-table-head"><span>{t('admin.userColumn')}</span><span>{t('admin.idColumn')}</span><span>{t('admin.country')}</span><span>{t('admin.registeredAt')}</span><span>{t('admin.status')}</span></div>{isLoadingUsers ? <AraChatLoader compact title={t('admin.usersTitle')} text={t('admin.loadingUsers')} /> : users.map((user) => <button className="admin-table-row" type="button" key={user.id} onClick={() => void openUserDetails(user)}><span className="admin-user-identity"><i>{user.display_name?.[0] || user.username?.[0] || 'A'}</i><span><strong>{user.display_name}{user.is_official ? <em>✓</em> : null}</strong><small>@{user.username}</small></span></span><span className="admin-user-id">{user.nexus_id}</span><span>{countryLabel(user.country)}</span><span>{formatDate(user.created_at, language)}</span><span className="admin-row-status"><b className={`admin-status ${user.status}`}>{statusLabel(user.status, t)}</b><AdminIcon name="arrow" size={16} /></span></button>)}{!isLoadingUsers && !users.length ? <p className="admin-empty-state">{t('admin.noUsers')}</p> : null}</section>
              </>
            ) : null}

            {activeTab === 'branches' ? (
              <>
                <header className="admin-page-heading"><div><p className="eyebrow">{t('admin.tabs.branches')}</p><h1>{t('admin.branchesTitle')}</h1><p>{t('admin.branchesText')}</p></div><Button type="button" onClick={() => { setBranchForm(EMPTY_BRANCH_FORM); setBranchStatus(''); setIsBranchDialogOpen(true); }}><AdminIcon name="plus" size={17} />{t('admin.createBranch')}</Button></header>
                {isLoadingBranches ? <AraChatLoader title={t('admin.branchesTitle')} text={t('admin.loadingBranches')} /> : <section className="admin-branch-catalog">{branches.map((branch) => <article className={`admin-branch-card ${branch.is_archived ? 'archived' : ''}`} key={branch.id}><div className="admin-branch-avatar">{branch.avatar_ref || '📣'}</div><div className="admin-branch-copy"><div><strong>{branch.title}</strong>{branch.is_official ? <span className="official-badge">✓</span> : null}<b className={`admin-status ${branch.is_archived ? 'deleted' : 'active'}`}>{branch.is_archived ? t('admin.archived') : t('admin.published')}</b></div><span>#{branch.slug} · {t('admin.subscribers').replace('{count}', String(branch.subscriber_count))}</span><small>{branch.owner_name ? `${t('admin.owner')}: ${branch.owner_name} (@${branch.owner_username})` : t('admin.ownerMissing')}</small></div><button className="admin-more-button" type="button" onClick={() => openBranchEditor(branch)} aria-label={t('admin.edit')} title={t('admin.edit')}><AdminIcon name="more" /></button></article>)}</section>}{!isLoadingBranches && !branches.length ? <p className="admin-empty-state">{t('admin.noBranches')}</p> : null}
              </>
            ) : null}

            {activeTab === 'maintenance' ? <><header className="admin-page-heading"><div><p className="eyebrow">{t('admin.tabs.maintenance')}</p><h1>{t('admin.maintenanceTitle')}</h1><p>{t('admin.maintenanceText')}</p></div><button className="admin-icon-button" type="button" onClick={() => void loadMaintenance()} aria-label={t('admin.refresh')} title={t('admin.refresh')}><AdminIcon name="refresh" /></button></header>{isLoadingMaintenance && !maintenance ? <AraChatLoader compact title={t('admin.maintenanceLoading')} text={t('admin.maintenanceLoadingText')} /> : <div className="admin-maintenance-grid"><section className="admin-surface admin-maintenance-host"><header><div><h2>{t('admin.hostStorageTitle')}</h2><p>{maintenance?.host.collector_available ? t('admin.hostStorageUpdated').replace('{date}', formatDate(maintenance.host.collected_at, language)) : t('admin.hostStorageUnavailable')}</p></div><span className={`admin-storage-state ${storageLevel(maintenance?.host.disk_usage_percent)}`}>{maintenance?.host.disk_usage_percent ?? '—'}%</span></header><div className="admin-disk-meter" aria-label={t('admin.diskUsage')}><i><b style={{ width: `${Math.min(maintenance?.host.disk_usage_percent ?? 0, 100)}%` }} /></i><span>{formatBytes(maintenance?.host.disk_used_bytes)} / {formatBytes(maintenance?.host.disk_total_bytes)}</span></div><dl className="admin-storage-breakdown"><div><dt>{t('admin.dockerData')}</dt><dd>{formatBytes(maintenance?.host.docker_bytes)}</dd></div><div><dt>{t('admin.dockerLogs')}</dt><dd>{formatBytes(maintenance?.host.docker_log_bytes)}</dd></div><div><dt>{t('admin.postgresData')}</dt><dd>{formatBytes(maintenance?.host.postgres_bytes)}</dd></div><div><dt>{t('admin.redisData')}</dt><dd>{formatBytes(maintenance?.host.redis_bytes)}</dd></div><div><dt>{t('admin.localBackups')}</dt><dd>{formatBytes(maintenance?.host.local_backup_bytes)}</dd></div></dl><p className="admin-maintenance-note">{t('admin.hostStorageNote')}</p></section><section className="admin-surface admin-maintenance-retention"><header><div><h2>{t('admin.retentionTitle')}</h2><p>{t('admin.retentionText')}</p></div><Button type="button" onClick={() => void runRetention()} disabled={isRunningRetention}>{isRunningRetention ? t('admin.maintenanceRunning') : t('admin.maintenanceRun')}</Button></header><p className="admin-maintenance-safety">{t('admin.retentionSafety')}</p><div className="admin-retention-list">{maintenance?.retention.categories?.map((item) => <div key={item.key}><span>{t(`admin.retentionCategories.${item.key}`)}</span><strong>{item.count.toLocaleString(language)}{item.bytes !== null ? ` · ${formatBytes(item.bytes)}` : ''}</strong></div>)}</div>{maintenanceStatus ? <p className={maintenanceStatus === t('admin.maintenanceRunComplete') ? 'success-text' : 'error-text'}>{maintenanceStatus}</p> : null}</section></div>}</> : null}

            {activeTab === 'audit' ? <><header className="admin-page-heading"><div><p className="eyebrow">{t('admin.tabs.audit')}</p><h1>{t('admin.auditTitle')}</h1><p>{t('admin.auditText')}</p></div><button className="admin-icon-button" type="button" onClick={() => void loadOverview()} aria-label={t('admin.refresh')} title={t('admin.refresh')}><AdminIcon name="refresh" /></button></header><section className="admin-surface admin-audit-feed">{auditLogs.length ? auditLogs.map((entry) => <article key={entry.id}><span className="admin-audit-icon"><AdminIcon name="audit" size={17} /></span><div><strong>{actionLabel(entry.action, t)}</strong><small>{entry.target_type ? `${entry.target_type} · ` : ''}{entry.target_id || t('admin.systemEvent')}</small></div><time>{formatDate(entry.created_at, language)}</time></article>) : <p className="admin-empty-state">{t('admin.auditEmpty')}</p>}</section></> : null}
          </section>
        </div>
      </section>

      {selectedUser ? <div className="admin-drawer-layer" role="presentation" onMouseDown={closeUserDetails}><aside className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-user-title" onMouseDown={(event) => event.stopPropagation()}><header><button className="admin-drawer-close" type="button" onClick={closeUserDetails} aria-label={t('common.close')}><AdminIcon name="close" /></button><p className="eyebrow">{t('admin.userDetails')}</p>{isLoadingUserDetails ? <AraChatLoader compact title={t('admin.userDetails')} text={t('admin.loadingUserDetails')} /> : <><div className="admin-drawer-person"><span>{selectedUser.display_name?.[0] || selectedUser.username?.[0] || 'A'}</span><div><h2 id="admin-user-title">{selectedUser.display_name}</h2><p>@{selectedUser.username}</p></div></div><p className="admin-drawer-id">{selectedUser.nexus_id}</p><dl className="admin-drawer-data"><div><dt>{t('admin.status')}</dt><dd><b className={`admin-status ${selectedUser.status}`}>{statusLabel(selectedUser.status, t)}</b></dd></div><div><dt>{t('admin.country')}</dt><dd>{countryLabel(selectedUser.country)}</dd></div><div><dt>{t('admin.registeredAt')}</dt><dd>{formatDate(selectedUser.created_at, language)}</dd></div><div><dt>{t('admin.contactDetails')}</dt><dd>{selectedUser.phone || selectedUser.email || '—'}</dd></div><div><dt>{t('admin.vpnStatus')}</dt><dd>{selectedUser.vpn_enabled ? t('admin.vpnEnabled') : t('admin.vpnDisabled')}</dd></div></dl>{selectedUser.status !== 'deleted' ? <div className="admin-drawer-actions"><Button variant="secondary" type="button" disabled={isUpdatingUser} onClick={() => void toggleUserVpnStatus()}>{selectedUser.vpn_enabled ? t('admin.clearVpnWarning') : t('admin.enableVpnWarning')}</Button>{!selectedUser.is_official ? <><Button variant="secondary" type="button" onClick={() => openUserAction(selectedUser, selectedUser.status === 'blocked' ? 'active' : 'blocked')}>{selectedUser.status === 'blocked' ? t('admin.unblock') : t('admin.block')}</Button><Button variant="danger" type="button" onClick={() => openUserAction(selectedUser, 'deleted')}>{t('admin.delete')}</Button></> : null}</div> : null}</>}</header></aside></div> : null}

      {pendingAction ? <div className="app-dialog-backdrop" role="presentation" onMouseDown={() => setPendingAction(null)}><section className="app-dialog admin-confirm-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">{pendingAction.status === 'deleted' ? t('admin.irreversibleAction') : t('admin.confirmAction')}</p><h2>{pendingAction.status === 'deleted' ? t('admin.deleteUserTitle') : pendingAction.status === 'blocked' ? t('admin.blockUserTitle') : t('admin.unblockUserTitle')}</h2><p>{t('admin.actionTarget').replace('{name}', pendingAction.user.display_name)}</p>{pendingAction.status === 'deleted' ? <label className="field"><span>{t('admin.deleteConfirmation').replace('{word}', t('admin.deleteConfirmWord'))}</span><input className="text-input" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoFocus /></label> : null}<div className="admin-dialog-actions"><Button variant="secondary" type="button" onClick={() => setPendingAction(null)}>{t('messages.cancel')}</Button><Button variant={pendingAction.status === 'deleted' ? 'danger' : 'primary'} type="button" disabled={isUpdatingUser || (pendingAction.status === 'deleted' && deleteConfirmation !== t('admin.deleteConfirmWord'))} onClick={confirmUserAction}>{isUpdatingUser ? '…' : pendingAction.status === 'deleted' ? t('admin.delete') : pendingAction.status === 'blocked' ? t('admin.block') : t('admin.unblock')}</Button></div></section></div> : null}

      {isBranchDialogOpen ? <div className="app-dialog-backdrop" role="presentation" onMouseDown={() => setIsBranchDialogOpen(false)}><section className="app-dialog admin-branch-dialog" role="dialog" aria-modal="true" aria-labelledby="branch-dialog-title" onMouseDown={(event) => event.stopPropagation()}><button className="admin-dialog-close" type="button" onClick={() => setIsBranchDialogOpen(false)} aria-label={t('common.close')}>×</button><p className="eyebrow">AraChat Control</p><h2 id="branch-dialog-title">{t('admin.createBranch')}</h2><p className="muted">{t('admin.createBranchDescription')}</p><form className="admin-branch-form" onSubmit={createBranch}><TextInput label={t('admin.branchTitle')} value={branchForm.title} minLength="2" maxLength="120" required onChange={(event) => updateBranchField('title', event.target.value)} /><TextInput label={t('admin.branchAddress')} value={branchForm.slug} minLength="3" maxLength="64" required placeholder="product-news" onChange={(event) => updateBranchField('slug', event.target.value)} /><TextInput label={t('admin.branchIcon')} value={branchForm.avatar_ref} maxLength="255" onChange={(event) => updateBranchField('avatar_ref', event.target.value)} /><label className="field admin-branch-description"><span>{t('admin.branchDescription')}</span><textarea className="text-input" value={branchForm.description} maxLength="500" onChange={(event) => updateBranchField('description', event.target.value)} /></label><Button type="submit" disabled={isCreatingBranch}>{isCreatingBranch ? t('admin.creatingBranch') : t('admin.createBranch')}</Button></form>{branchStatus ? <p className="error-text">{branchStatus}</p> : null}</section></div> : null}

      {editingBranch ? <div className="admin-drawer-layer" role="presentation" onMouseDown={() => setEditingBranch(null)}><aside className="admin-drawer admin-branch-drawer" role="dialog" aria-modal="true" aria-labelledby="edit-branch-title" onMouseDown={(event) => event.stopPropagation()}><button className="admin-drawer-close" type="button" onClick={() => setEditingBranch(null)} aria-label={t('common.close')}><AdminIcon name="close" /></button><p className="eyebrow">{t('admin.branchManagement')}</p><h2 id="edit-branch-title">{editingBranch.title}</h2><form className="admin-drawer-form" onSubmit={saveBranch}><TextInput label={t('admin.branchTitle')} value={branchForm.title} minLength="2" maxLength="120" required onChange={(event) => updateBranchField('title', event.target.value)} /><TextInput label={t('admin.branchAddress')} value={branchForm.slug} minLength="3" maxLength="64" required onChange={(event) => updateBranchField('slug', event.target.value)} /><TextInput label={t('admin.branchIcon')} value={branchForm.avatar_ref} maxLength="255" onChange={(event) => updateBranchField('avatar_ref', event.target.value)} /><label className="field"><span>{t('admin.branchDescription')}</span><textarea className="text-input" value={branchForm.description} maxLength="500" onChange={(event) => updateBranchField('description', event.target.value)} /></label><Button type="submit" disabled={isSavingBranch}>{t('admin.saveBranch')}</Button></form><form className="admin-member-form" onSubmit={assignBranchMember}><h3>{t('admin.assignMember')}</h3><p>{t('admin.assignMemberText')}</p><label className="field"><span>{t('admin.userSearch')}</span><input className="text-input" value={memberUserQuery} onChange={(event) => setMemberUserQuery(event.target.value)} placeholder={t('admin.userSearchPlaceholder')} required /></label><label className="field"><span>{t('admin.memberRole')}</span><select className="text-input" value={memberRole} onChange={(event) => setMemberRole(event.target.value)}><option value="admin">{t('admin.branchAdmin')}</option><option value="owner">{t('admin.branchOwner')}</option></select></label><Button variant="secondary" type="submit" disabled={isSavingBranch}>{t('admin.assign')}</Button></form>{!editingBranch.is_official ? <section className="admin-danger-zone"><p>{t('admin.dangerZone')}</p><strong>{editingBranch.is_archived ? t('admin.restoreBranchText') : t('admin.archiveBranchText')}</strong><Button variant={editingBranch.is_archived ? 'secondary' : 'danger'} type="button" onClick={() => void toggleBranchArchive(editingBranch)}>{editingBranch.is_archived ? t('admin.restore') : t('admin.archive')}</Button></section> : null}{branchStatus ? <p className={branchStatus === t('admin.memberAssigned') ? 'success-text' : 'error-text'}>{branchStatus}</p> : null}</aside></div> : null}
    </main>
  );
}

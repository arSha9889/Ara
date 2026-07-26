import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { createPublicBranch } from '../../chats/api/chatApi.js';
import {
  getAdminAuditLogs,
  getAdminBranches,
  getAdminOverview,
  getAdminSecurityMetrics,
  getAdminUser,
  getAdminUsers,
  setAdminBranchArchived,
  setAdminBranchMember,
  updateAdminBranch,
  updateAdminUserStatus,
} from '../api/adminApi.js';

const TABS = ['overview', 'users', 'branches'];
const EMPTY_BRANCH_FORM = { title: '', slug: '', description: '', avatar_ref: '📢' };

function statusLabel(status, t) {
  return t(`admin.statuses.${status}`);
}

function actionLabel(action, t) {
  return t(`admin.auditActions.${action}`);
}

export function AdminPage() {
  const { t } = useI18n();
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

  const countries = overview?.countries ?? [];
  const countryOptions = useMemo(() => countries.map((item) => item.country), [countries]);

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

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function openUserAction(user, status) {
    setPendingAction({ user, status });
    setDeleteConfirmation('');
  }

  async function openUserDetails(user) {
    setSelectedUser(user);
    setIsLoadingUserDetails(true);
    try {
      setSelectedUser(await getAdminUser(session.accessToken, user.id));
    } catch (err) {
      setSelectedUser(null);
      setError(err.message);
    } finally {
      setIsLoadingUserDetails(false);
    }
  }

  async function confirmUserAction() {
    if (!pendingAction || (pendingAction.status === 'deleted' && deleteConfirmation !== t('admin.deleteConfirmWord'))) return;
    setIsUpdatingUser(true);
    try {
      await updateAdminUserStatus(session.accessToken, pendingAction.user.id, pendingAction.status);
      setSelectedUser(null);
      setPendingAction(null);
      await Promise.all([loadUsers(), loadOverview()]);
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
      setBranchStatus(t('admin.branchCreated'));
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

  return (
    <main className="admin-page">
      <section className="admin-workspace">
        <header className="admin-workspace-header"><Link to="/app" className="admin-back-link"><span aria-hidden="true">←</span>{t('admin.backToMessenger')}</Link><div className="admin-access-label"><span aria-hidden="true">✦</span>{t('admin.secureAccess')}</div></header>
        <section className="panel admin-panel">
          <header className="admin-panel-header"><div className="admin-title-mark" aria-hidden="true">🛡</div><div><p className="eyebrow">AraChat Control</p><h1>{t('admin.title')}</h1><p className="muted">{t('admin.subtitle')}</p></div></header>
          <nav className="admin-tabs" aria-label={t('admin.navigation')}>{TABS.map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{t(`admin.tabs.${tab}`)}</button>)}</nav>
          {error ? <p className="error-text">{error}</p> : null}
          {isLoadingOverview ? <AraChatLoader compact title={t('admin.loadingTitle')} text={t('admin.loadingText')} /> : null}
          {overview && activeTab === 'overview' ? <section className="admin-tab-content">
            <div className="admin-stats-grid"><article className="info-card"><span>{t('admin.totalUsers')}</span><strong>{overview.total_users}</strong></article><article className="info-card"><span>{t('admin.activeUsers')}</span><strong>{overview.active_users}</strong></article><article className="info-card"><span>{t('admin.registrationCountries')}</span><strong>{countries.length}</strong></article></div>
            <section className="admin-quick-actions"><button type="button" onClick={() => setActiveTab('users')}><span aria-hidden="true">⌕</span><strong>{t('admin.findUser')}</strong><small>{t('admin.findUserText')}</small></button><button type="button" onClick={() => { setActiveTab('branches'); setIsBranchDialogOpen(true); }}><span aria-hidden="true">＋</span><strong>{t('admin.createBranch')}</strong><small>{t('admin.createBranchText')}</small></button><button type="button" onClick={() => { setActiveTab('users'); setFilters((current) => ({ ...current, status: 'blocked' })); }}><span aria-hidden="true">◉</span><strong>{t('admin.blockedUsers')}</strong><small>{t('admin.blockedUsersText')}</small></button></section>
            {securityMetrics ? <section><header className="admin-section-heading"><div><h2>{t('admin.securityTitle')}</h2><p className="muted">{t('admin.securityText')}</p></div></header><div className="admin-security-grid"><article><span>{t('admin.activeSessions')}</span><strong>{securityMetrics.active_sessions}</strong></article><article><span>{t('admin.lockedPasswords')}</span><strong>{securityMetrics.locked_passwords}</strong></article><article><span>{t('admin.lockedPins')}</span><strong>{securityMetrics.locked_pins}</strong></article><article><span>{t('admin.archivedBranches')}</span><strong>{securityMetrics.archived_branches}</strong></article></div></section> : null}
            <section className="settings-section"><h2>{t('admin.registrationCountries')}</h2><div className="admin-country-list">{countries.map((item) => <span key={item.country}>{item.country}: <strong>{item.count}</strong></span>)}</div></section>
            <section><header className="admin-section-heading"><div><h2>{t('admin.auditTitle')}</h2><p className="muted">{t('admin.auditText')}</p></div></header><div className="admin-audit-list">{auditLogs.length ? auditLogs.map((item) => <article key={item.id}><div><strong>{actionLabel(item.action, t)}</strong><span>{item.target_type ? `${item.target_type} · ${item.target_id ?? '—'}` : '—'}</span></div><time>{new Date(item.created_at).toLocaleString()}</time></article>) : <p className="admin-empty-state">{t('admin.auditEmpty')}</p>}</div></section>
          </section> : null}
          {overview && activeTab === 'users' ? <section className="admin-tab-content"><header className="admin-section-heading"><div><h2>{t('admin.usersTitle')}</h2><p className="muted">{t('admin.usersFound').replace('{count}', String(usersTotal))}</p></div></header><div className="admin-user-filters"><label><span>{t('admin.search')}</span><input value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} placeholder={t('admin.searchPlaceholder')} /></label><label><span>{t('admin.status')}</span><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>{['all', 'active', 'blocked', 'deleted'].map((status) => <option key={status} value={status}>{status === 'all' ? t('admin.allStatuses') : statusLabel(status, t)}</option>)}</select></label><label><span>{t('admin.country')}</span><select value={filters.country} onChange={(event) => updateFilter('country', event.target.value)}><option value="">{t('admin.allCountries')}</option>{countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}</select></label><label><span>{t('admin.sort')}</span><select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}>{['newest', 'oldest', 'name'].map((sort) => <option key={sort} value={sort}>{t(`admin.sortOptions.${sort}`)}</option>)}</select></label></div>{isLoadingUsers ? <AraChatLoader compact title={t('admin.usersTitle')} text={t('admin.loadingUsers')} /> : null}{!isLoadingUsers && users.length === 0 ? <p className="admin-empty-state">{t('admin.noUsers')}</p> : null}<div className="admin-users-table" role="table">{users.map((user) => <article className="admin-user-row" key={user.id} role="row"><div><strong>{user.display_name} {user.is_official ? <span className="official-badge">✓</span> : null}</strong><span>@{user.username} · {user.nexus_id}</span></div><div><span>{user.country} · {new Date(user.created_at).toLocaleDateString()}</span><small>{t('admin.contactsHidden')}</small></div><div className="admin-user-actions"><span className={`admin-status ${user.status}`}>{statusLabel(user.status, t)}</span><button className="button button-secondary" type="button" onClick={() => void openUserDetails(user)}>{t('admin.details')}</button></div></article>)}</div></section> : null}
          {overview && activeTab === 'branches' ? <section className="admin-tab-content"><header className="admin-section-heading"><div><h2>{t('admin.branchesTitle')}</h2><p className="muted">{t('admin.branchesText')}</p></div><Button type="button" onClick={() => { setBranchForm(EMPTY_BRANCH_FORM); setBranchStatus(''); setIsBranchDialogOpen(true); }}>{t('admin.createBranch')}</Button></header>{isLoadingBranches ? <AraChatLoader compact title={t('admin.branchesTitle')} text={t('admin.loadingBranches')} /> : null}<div className="admin-branches-list">{branches.map((branch) => <article className={`admin-branch-row${branch.is_archived ? ' archived' : ''}`} key={branch.id}><div className="admin-branch-icon">{branch.avatar_ref || '📣'}</div><div><strong>{branch.title} {branch.is_official ? <span className="official-badge">✓</span> : null}</strong><span>#{branch.slug} · {t('admin.subscribers').replace('{count}', String(branch.subscriber_count))}</span><small>{branch.owner_name ? `${t('admin.owner')}: ${branch.owner_name} (@${branch.owner_username})` : t('admin.ownerMissing')}</small></div><div className="admin-branch-actions"><span className={`admin-status ${branch.is_archived ? 'deleted' : 'active'}`}>{branch.is_archived ? t('admin.archived') : t('admin.published')}</span><Button variant="secondary" type="button" onClick={() => openBranchEditor(branch)}>{t('admin.edit')}</Button>{!branch.is_official ? <Button variant={branch.is_archived ? 'secondary' : 'danger'} type="button" onClick={() => void toggleBranchArchive(branch)}>{branch.is_archived ? t('admin.restore') : t('admin.archive')}</Button> : null}</div></article>)}</div>{!isLoadingBranches && !branches.length ? <p className="admin-empty-state">{t('admin.noBranches')}</p> : null}</section> : null}
        </section>
      </section>
      {selectedUser ? <div className="app-dialog-backdrop" role="presentation" onMouseDown={() => setSelectedUser(null)}><section className="app-dialog admin-user-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-user-title" onMouseDown={(event) => event.stopPropagation()}><button className="admin-dialog-close" type="button" onClick={() => setSelectedUser(null)} aria-label={t('common.close')}>×</button><p className="eyebrow">{t('admin.userDetails')}</p><h2 id="admin-user-title">{selectedUser.display_name}</h2><p className="muted">@{selectedUser.username} · {selectedUser.nexus_id}</p>{isLoadingUserDetails ? <AraChatLoader compact title={t('admin.userDetails')} text={t('admin.loadingUserDetails')} /> : <><dl className="admin-user-details"><div><dt>{t('admin.status')}</dt><dd><span className={`admin-status ${selectedUser.status}`}>{statusLabel(selectedUser.status, t)}</span></dd></div><div><dt>{t('admin.country')}</dt><dd>{selectedUser.country}</dd></div><div><dt>{t('admin.registeredAt')}</dt><dd>{new Date(selectedUser.created_at).toLocaleString()}</dd></div><div><dt>{t('admin.contactDetails')}</dt><dd>{selectedUser.phone || selectedUser.email || '—'}</dd></div></dl>{!selectedUser.is_official && selectedUser.status !== 'deleted' ? <div className="admin-dialog-actions"><Button variant="secondary" type="button" onClick={() => openUserAction(selectedUser, selectedUser.status === 'blocked' ? 'active' : 'blocked')}>{selectedUser.status === 'blocked' ? t('admin.unblock') : t('admin.block')}</Button><Button variant="danger" type="button" onClick={() => openUserAction(selectedUser, 'deleted')}>{t('admin.delete')}</Button></div> : null}</>}</section></div> : null}
      {pendingAction ? <div className="app-dialog-backdrop" role="presentation" onMouseDown={() => setPendingAction(null)}><section className="app-dialog admin-confirm-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">{pendingAction.status === 'deleted' ? t('admin.irreversibleAction') : t('admin.confirmAction')}</p><h2>{pendingAction.status === 'deleted' ? t('admin.deleteUserTitle') : pendingAction.status === 'blocked' ? t('admin.blockUserTitle') : t('admin.unblockUserTitle')}</h2><p>{t('admin.actionTarget').replace('{name}', pendingAction.user.display_name)}</p>{pendingAction.status === 'deleted' ? <label className="field"><span>{t('admin.deleteConfirmation').replace('{word}', t('admin.deleteConfirmWord'))}</span><input className="text-input" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoFocus /></label> : null}<div className="admin-dialog-actions"><Button variant="secondary" type="button" onClick={() => setPendingAction(null)}>{t('messages.cancel')}</Button><Button variant={pendingAction.status === 'deleted' ? 'danger' : 'primary'} type="button" disabled={isUpdatingUser || (pendingAction.status === 'deleted' && deleteConfirmation !== t('admin.deleteConfirmWord'))} onClick={confirmUserAction}>{isUpdatingUser ? '…' : pendingAction.status === 'deleted' ? t('admin.delete') : pendingAction.status === 'blocked' ? t('admin.block') : t('admin.unblock')}</Button></div></section></div> : null}
      {isBranchDialogOpen ? <div className="app-dialog-backdrop" role="presentation" onMouseDown={() => setIsBranchDialogOpen(false)}><section className="app-dialog admin-branch-dialog" role="dialog" aria-modal="true" aria-labelledby="branch-dialog-title" onMouseDown={(event) => event.stopPropagation()}><button className="admin-dialog-close" type="button" onClick={() => setIsBranchDialogOpen(false)} aria-label={t('common.close')}>×</button><p className="eyebrow">AraChat Control</p><h2 id="branch-dialog-title">{t('admin.createBranch')}</h2><p className="muted">{t('admin.createBranchDescription')}</p><form className="admin-branch-form" onSubmit={createBranch}><TextInput label={t('admin.branchTitle')} value={branchForm.title} minLength="2" maxLength="120" required onChange={(event) => updateBranchField('title', event.target.value)} /><TextInput label={t('admin.branchAddress')} value={branchForm.slug} minLength="3" maxLength="64" required placeholder="product-news" onChange={(event) => updateBranchField('slug', event.target.value)} /><TextInput label={t('admin.branchIcon')} value={branchForm.avatar_ref} maxLength="255" onChange={(event) => updateBranchField('avatar_ref', event.target.value)} /><label className="field admin-branch-description"><span>{t('admin.branchDescription')}</span><textarea className="text-input" value={branchForm.description} maxLength="500" onChange={(event) => updateBranchField('description', event.target.value)} /></label><Button type="submit" disabled={isCreatingBranch}>{isCreatingBranch ? t('admin.creatingBranch') : t('admin.createBranch')}</Button></form>{branchStatus ? <p className={branchStatus === t('admin.branchCreated') ? 'success-text' : 'error-text'}>{branchStatus}</p> : null}</section></div> : null}
      {editingBranch ? <div className="app-dialog-backdrop" role="presentation" onMouseDown={() => setEditingBranch(null)}><section className="app-dialog admin-branch-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-branch-title" onMouseDown={(event) => event.stopPropagation()}><button className="admin-dialog-close" type="button" onClick={() => setEditingBranch(null)} aria-label={t('common.close')}>×</button><p className="eyebrow">{t('admin.branchManagement')}</p><h2 id="edit-branch-title">{editingBranch.title}</h2><form className="admin-branch-form" onSubmit={saveBranch}><TextInput label={t('admin.branchTitle')} value={branchForm.title} minLength="2" maxLength="120" required onChange={(event) => updateBranchField('title', event.target.value)} /><TextInput label={t('admin.branchAddress')} value={branchForm.slug} minLength="3" maxLength="64" required onChange={(event) => updateBranchField('slug', event.target.value)} /><TextInput label={t('admin.branchIcon')} value={branchForm.avatar_ref} maxLength="255" onChange={(event) => updateBranchField('avatar_ref', event.target.value)} /><label className="field admin-branch-description"><span>{t('admin.branchDescription')}</span><textarea className="text-input" value={branchForm.description} maxLength="500" onChange={(event) => updateBranchField('description', event.target.value)} /></label><Button type="submit" disabled={isSavingBranch}>{t('admin.saveBranch')}</Button></form><form className="admin-member-form" onSubmit={assignBranchMember}><h3>{t('admin.assignMember')}</h3><p className="muted">{t('admin.assignMemberText')}</p><label className="field"><span>{t('admin.userSearch')}</span><input className="text-input" value={memberUserQuery} onChange={(event) => setMemberUserQuery(event.target.value)} placeholder={t('admin.userSearchPlaceholder')} required /></label><label className="field"><span>{t('admin.memberRole')}</span><select className="text-input" value={memberRole} onChange={(event) => setMemberRole(event.target.value)}><option value="admin">{t('admin.branchAdmin')}</option><option value="owner">{t('admin.branchOwner')}</option></select></label><Button variant="secondary" type="submit" disabled={isSavingBranch}>{t('admin.assign')}</Button></form>{branchStatus ? <p className={branchStatus === t('admin.memberAssigned') ? 'success-text' : 'error-text'}>{branchStatus}</p> : null}</section></div> : null}
    </main>
  );
}

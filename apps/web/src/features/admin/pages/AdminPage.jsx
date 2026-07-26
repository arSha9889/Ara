import { useEffect, useState } from 'react';

import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { TextInput } from '../../../shared/ui/TextInput.jsx';
import { createPublicBranch } from '../../chats/api/chatApi.js';
import { getAdminOverview, updateAdminUserStatus } from '../api/adminApi.js';

export function AdminPage() {
  const { session } = useSession();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [branchStatus, setBranchStatus] = useState('');
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [branchForm, setBranchForm] = useState({ title: '', slug: '', description: '', avatar_ref: '📢' });

  async function loadOverview() {
    setIsLoading(true);
    try {
      setOverview(await getAdminOverview(session.accessToken));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  async function changeStatus(userId, status) {
    try {
      await updateAdminUserStatus(session.accessToken, userId, status);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  }

  function updateBranchField(name, value) {
    setBranchForm((current) => ({ ...current, [name]: value }));
  }

  async function createBranch(event) {
    event.preventDefault();
    const payload = {
      ...branchForm,
      title: branchForm.title.trim(),
      slug: branchForm.slug.trim().toLowerCase(),
      description: branchForm.description.trim(),
      avatar_ref: branchForm.avatar_ref.trim() || null,
    };
    if (!/^[a-z0-9-]{3,64}$/.test(payload.slug)) {
      setBranchStatus('Адрес ветви: 3–64 строчных латинских символа, цифры или дефис.');
      return;
    }
    setIsCreatingBranch(true);
    setBranchStatus('');
    try {
      await createPublicBranch(session.accessToken, payload);
      setBranchForm({ title: '', slug: '', description: '', avatar_ref: '📢' });
      setBranchStatus('Публичная ветвь создана. Она уже доступна для чтения и подписки.');
    } catch (err) {
      setBranchStatus(err.message);
    } finally {
      setIsCreatingBranch(false);
    }
  }

  return (
    <section className="panel admin-panel">
      <header className="section-header">
        <div>
          <p className="eyebrow">AraChat Control</p>
          <h1>Админ-панель</h1>
          <p className="muted">Защищённый обзор пользователей, стран и статусов доступа.</p>
        </div>
      </header>
      {isLoading ? <AraChatLoader compact title="Загружаем данные" text="Проверяем доступ и собираем статистику…" /> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {overview ? (
        <>
          <div className="admin-stats-grid">
            <article className="info-card"><span>Всего пользователей</span><strong>{overview.total_users}</strong></article>
            <article className="info-card"><span>Активны</span><strong>{overview.active_users}</strong></article>
            <article className="info-card"><span>Стран регистрации</span><strong>{overview.countries.length}</strong></article>
          </div>
          <section className="settings-section admin-branch-section">
            <div>
              <h2>Новая публичная ветвь</h2>
              <p className="muted">Читать и подписываться смогут все пользователи. Публикации доступны только владельцу и назначенным администраторам ветви.</p>
            </div>
            <form className="admin-branch-form" onSubmit={createBranch}>
              <TextInput label="Название" value={branchForm.title} minLength="2" maxLength="120" required onChange={(event) => updateBranchField('title', event.target.value)} />
              <TextInput label="Адрес" value={branchForm.slug} minLength="3" maxLength="64" required placeholder="product-news" onChange={(event) => updateBranchField('slug', event.target.value)} />
              <TextInput label="Иконка (необязательно)" value={branchForm.avatar_ref} maxLength="255" onChange={(event) => updateBranchField('avatar_ref', event.target.value)} />
              <label className="field admin-branch-description"><span>Описание</span><textarea className="text-input" value={branchForm.description} maxLength="500" onChange={(event) => updateBranchField('description', event.target.value)} /></label>
              <Button type="submit" disabled={isCreatingBranch}>{isCreatingBranch ? 'Создаём ветвь…' : 'Создать ветвь'}</Button>
            </form>
            {branchStatus ? <p className={branchStatus.startsWith('Публичная') ? 'success-text' : 'error-text'}>{branchStatus}</p> : null}
          </section>
          <section className="settings-section">
            <h2>Регистрация по странам</h2>
            <div className="admin-country-list">
              {overview.countries.map((item) => <span key={item.country}>{item.country}: <strong>{item.count}</strong></span>)}
            </div>
          </section>
          <section className="settings-section admin-users-section">
            <h2>Пользователи</h2>
            <div className="admin-users-table" role="table">
              {overview.users.map((user) => (
                <article className="admin-user-row" key={user.id} role="row">
                  <div><strong>{user.display_name} {user.is_official ? <span className="official-badge" title="Официальный аккаунт">✓</span> : null}</strong><span>@{user.username} · {user.nexus_id}</span></div>
                  <div><span>{user.phone || user.email || '—'}</span><small>{user.country} · {new Date(user.created_at).toLocaleDateString()}</small></div>
                  <div className="admin-user-actions"><span className={`admin-status ${user.status}`}>{user.status}</span>{!user.is_official ? <><button className="button button-secondary" type="button" onClick={() => changeStatus(user.id, user.status === 'blocked' ? 'active' : 'blocked')}>{user.status === 'blocked' ? 'Разблокировать' : 'Заблокировать'}</button><button className="button button-danger" type="button" onClick={() => { if (window.confirm(`Удалить ${user.display_name}?`)) changeStatus(user.id, 'deleted'); }}>Удалить</button></> : null}</div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

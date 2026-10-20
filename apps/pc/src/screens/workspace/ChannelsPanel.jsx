import { useCallback, useEffect, useRef, useState } from 'react';

import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';
import {
  createPrivateChannel,
  getPublicChannels,
  joinPrivateChannel,
  subscribeToPublicChannel,
  unsubscribeFromPublicChannel,
  uploadChannelAvatar,
} from '../../features/chats/chatsApi.js';
import { mediaUrlForDesktop } from '../../shared/api/authenticatedMedia.js';

const INVITE_PREFIX = 'arachat://channel-invite/';
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,256}$/;

function initials(value) {
  return (value || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function channelInviteToken(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith(INVITE_PREFIX)) return trimmed.slice(INVITE_PREFIX.length).split(/[?#/]/, 1)[0];
  return trimmed;
}

function ChannelAvatar({ channel, size = 'normal' }) {
  const url = mediaUrlForDesktop(channel.avatar_ref);
  const className = `channel-avatar channel-avatar-${size}`;
  if (url) return <span className={className}><img src={url} alt="" /></span>;
  return <span className={className} aria-hidden="true">{initials(channel.title)}</span>;
}

export function ChannelsPanel({ accessToken, channels, onChannelChanged, onOpenChannel, t }) {
  const [catalog, setCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('list');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [inviteValue, setInviteValue] = useState('');
  const avatarInputRef = useRef(null);

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const items = await getPublicChannels(accessToken);
      setCatalog(Array.isArray(items) ? items : []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  function resetForms() {
    setTitle('');
    setDescription('');
    setAvatarFile(null);
    setInviteValue('');
    setError('');
  }

  function changeMode(nextMode) {
    resetForms();
    setNotice('');
    setMode(nextMode);
  }

  async function createChannel(event) {
    event.preventDefault();
    if (isSaving) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      const avatar = avatarFile ? await uploadChannelAvatar(accessToken, avatarFile) : null;
      const result = await createPrivateChannel(accessToken, {
        title: title.trim(),
        description: description.trim(),
        avatar_ref: avatar?.media_url ?? null,
      });
      if (!result?.chat) throw new Error(t('workspace.channels.createInvalidResponse'));
      onChannelChanged?.(result.chat);
      setMode('list');
      resetForms();
      setNotice(t('workspace.channels.created'));
      onOpenChannel?.(result.chat.id, result.chat);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function joinByInvite(event) {
    event.preventDefault();
    if (isSaving) return;
    const inviteToken = channelInviteToken(inviteValue);
    if (!INVITE_TOKEN_PATTERN.test(inviteToken)) {
      setError(t('workspace.channels.inviteInvalid'));
      return;
    }
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      const channel = await joinPrivateChannel(accessToken, inviteToken);
      onChannelChanged?.(channel);
      setMode('list');
      resetForms();
      setNotice(t('workspace.channels.joined'));
      onOpenChannel?.(channel.id, channel);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePublicSubscription(channel) {
    if (isSaving) return;
    setError('');
    setNotice('');
    setIsSaving(true);
    try {
      const nextChannel = channel.is_subscribed
        ? await unsubscribeFromPublicChannel(accessToken, channel.id)
        : await subscribeToPublicChannel(accessToken, channel.id);
      setCatalog((current) => current.map((item) => item.id === nextChannel.id ? nextChannel : item));
      onChannelChanged?.(nextChannel);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  if (mode === 'create') {
    return <section className="workspace-detail-panel channels-panel" aria-labelledby="channel-create-title">
      <header className="workspace-panel-heading">
        <div><p>{t('workspace.channels.kicker')}</p><h1 id="channel-create-title">{t('workspace.channels.createTitle')}</h1><span>{t('workspace.channels.createIntro')}</span></div>
        <div className="workspace-panel-actions"><span className="workspace-panel-icon"><Icon name="channels" size={25} /></span><button className="channel-form-close" type="button" aria-label={t('common.close')} title={t('common.close')} onClick={() => changeMode('list')}><Icon name="close" size={18} /></button></div>
      </header>
      <form className="workspace-section-card channel-form" onSubmit={createChannel}>
        <label><span>{t('workspace.channels.titleLabel')}</span><input value={title} onChange={(event) => setTitle(event.target.value)} minLength="2" maxLength="120" required autoFocus /></label>
        <label><span>{t('workspace.channels.descriptionLabel')}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength="500" rows="4" /></label>
        <input className="sr-only" ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,image/avif" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} />
        <div className="channel-avatar-upload"><span><Icon name="image" size={18} /></span><div><strong>{t('workspace.channels.avatarLabel')}</strong><small>{avatarFile?.name || t('workspace.channels.avatarHint')}</small></div><button type="button" onClick={() => avatarInputRef.current?.click()}>{t('workspace.channels.chooseAvatar')}</button></div>
        {error ? <p className="channel-form-error" role="alert">{error}</p> : null}
        <div className="channel-form-actions"><button type="button" className="workspace-outline-button" onClick={() => changeMode('list')}>{t('common.cancel')}</button><button type="submit" className="channel-primary-button" disabled={isSaving || title.trim().length < 2}>{isSaving ? t('workspace.channels.creating') : t('workspace.channels.create')}</button></div>
      </form>
    </section>;
  }

  if (mode === 'join') {
    return <section className="workspace-detail-panel channels-panel" aria-labelledby="channel-join-title">
      <header className="workspace-panel-heading">
        <div><p>{t('workspace.channels.kicker')}</p><h1 id="channel-join-title">{t('workspace.channels.joinTitle')}</h1><span>{t('workspace.channels.joinIntro')}</span></div>
        <div className="workspace-panel-actions"><span className="workspace-panel-icon"><Icon name="channels" size={25} /></span><button className="channel-form-close" type="button" aria-label={t('common.close')} title={t('common.close')} onClick={() => changeMode('list')}><Icon name="close" size={18} /></button></div>
      </header>
      <form className="workspace-section-card channel-form" onSubmit={joinByInvite}>
        <label><span>{t('workspace.channels.inviteLabel')}</span><textarea value={inviteValue} onChange={(event) => setInviteValue(event.target.value)} rows="3" placeholder={t('workspace.channels.invitePlaceholder')} required autoFocus /></label>
        {error ? <p className="channel-form-error" role="alert">{error}</p> : null}
        <div className="channel-form-actions"><button type="button" className="workspace-outline-button" onClick={() => changeMode('list')}>{t('common.cancel')}</button><button type="submit" className="channel-primary-button" disabled={isSaving || !inviteValue.trim()}>{isSaving ? t('workspace.channels.joining') : t('workspace.channels.join')}</button></div>
      </form>
    </section>;
  }

  const privateChannels = channels.filter((channel) => channel.is_private);
  return <section className="workspace-detail-panel channels-panel" aria-labelledby="channels-title">
    <header className="workspace-panel-heading">
      <div><p>{t('workspace.channels.kicker')}</p><h1 id="channels-title">{t('workspace.channels.title')}</h1><span>{t('workspace.channels.intro')}</span></div>
      <span className="workspace-panel-icon"><Icon name="channels" size={25} /></span>
    </header>
    <div className="channels-actions">
      <button className="channel-primary-button" type="button" onClick={() => changeMode('create')}><Icon name="plus" size={17} />{t('workspace.channels.create')}</button>
      <button className="workspace-outline-button" type="button" onClick={() => changeMode('join')}><Icon name="link" size={17} />{t('workspace.channels.joinByInvite')}</button>
    </div>
    {notice ? <p className="workspace-list-notice" role="status">{notice}</p> : null}
    {error ? <div className="workspace-list-error" role="alert"><strong>{t('workspace.channels.errorTitle')}</strong><span>{error}</span><button type="button" onClick={() => void loadCatalog()}>{t('workspace.retry')}</button></div> : null}
    <section className="workspace-section-card channel-section" aria-labelledby="my-channels-title">
      <div className="channel-section-heading"><h2 id="my-channels-title">{t('workspace.channels.myChannels')}</h2><span>{privateChannels.length}</span></div>
      {privateChannels.length ? <div className="channel-card-list">{privateChannels.map((channel) => <button className="channel-card" type="button" key={channel.id} onClick={() => onOpenChannel?.(channel.id, channel)}><ChannelAvatar channel={channel} /><span><strong>{channel.title}</strong><small>{channel.description || t('workspace.channels.privateChannel')}</small></span><Icon name="chevron-right" size={18} /></button>)}</div> : <p className="channel-empty">{t('workspace.channels.noMyChannels')}</p>}
    </section>
    <section className="workspace-section-card channel-section" aria-labelledby="catalog-channels-title">
      <div className="channel-section-heading"><h2 id="catalog-channels-title">{t('workspace.channels.catalog')}</h2><button type="button" aria-label={t('workspace.channels.refreshCatalog')} title={t('workspace.channels.refreshCatalog')} onClick={() => void loadCatalog()} disabled={isLoading}><Icon name="refresh" size={15} /></button></div>
      {isLoading ? <p className="channel-empty" role="status">{t('workspace.channels.loadingCatalog')}</p> : catalog.length ? <div className="channel-card-list">{catalog.map((channel) => <div className="channel-card" key={channel.id}><button type="button" className="channel-card-main" onClick={() => channel.is_subscribed && onOpenChannel?.(channel.id, channel)} disabled={!channel.is_subscribed}><ChannelAvatar channel={channel} /><span><strong>{channel.title}</strong><small>{channel.description || t('workspace.noMessagesPreview')}</small></span></button><button type="button" className="channel-subscribe-button" onClick={() => void togglePublicSubscription(channel)} disabled={isSaving}>{channel.is_subscribed ? t('workspace.channels.open') : t('workspace.channels.subscribe')}</button></div>)}</div> : <p className="channel-empty">{t('workspace.channels.noCatalog')}</p>}
    </section>
  </section>;
}

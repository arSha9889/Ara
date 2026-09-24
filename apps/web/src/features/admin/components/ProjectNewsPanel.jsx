import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../../app/providers/I18nProvider.jsx';
import { useSession } from '../../../app/providers/SessionProvider.jsx';
import { AraChatLoader } from '../../../shared/ui/AraChatLoader.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import {
  archiveAdminProjectNews,
  createAdminProjectNews,
  getAdminProjectNews,
  publishAdminProjectNews,
  updateAdminProjectNews,
} from '../api/adminApi.js';

const EMPTY_TRANSLATION = { title: '', excerpt: '', content: '' };
const EMPTY_NEWS_FORM = {
  slug: '',
  scheduledAt: '',
  translations: { ru: EMPTY_TRANSLATION, en: EMPTY_TRANSLATION },
};

function formatDate(value, language) {
  return value ? new Date(value).toLocaleString(language) : '—';
}

function isoToDatetimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function datetimeLocalToIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function emptyNewsForm() {
  return {
    ...EMPTY_NEWS_FORM,
    translations: {
      ru: { ...EMPTY_TRANSLATION },
      en: { ...EMPTY_TRANSLATION },
    },
  };
}

function formFromNews(news) {
  const translations = Object.fromEntries(news.translations.map((item) => [
    item.language,
    { ...item, content: item.content.join('\n\n') },
  ]));
  return {
    slug: news.slug,
    scheduledAt: isoToDatetimeLocal(news.scheduled_at),
    translations: {
      ru: translations.ru ?? { ...EMPTY_TRANSLATION },
      en: translations.en ?? { ...EMPTY_TRANSLATION },
    },
  };
}

function formPayload(form) {
  return {
    slug: form.slug.trim(),
    scheduled_at: datetimeLocalToIso(form.scheduledAt),
    translations: ['ru', 'en'].map((language) => ({
      language,
      title: form.translations[language].title.trim(),
      excerpt: form.translations[language].excerpt.trim(),
      content: form.translations[language].content
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean),
    })),
  };
}

function translationFor(news, language) {
  return news.translations.find((item) => item.language === language)
    ?? news.translations.find((item) => item.language === 'ru')
    ?? news.translations[0];
}

export function ProjectNewsPanel() {
  const { language, t } = useI18n();
  const { session } = useSession();
  const [news, setNews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNewsId, setEditingNewsId] = useState(null);
  const [form, setForm] = useState(emptyNewsForm);
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const preferredContentLanguage = language === 'en' ? 'en' : 'ru';
  const preview = useMemo(() => ({
    ...form.translations[preferredContentLanguage],
    publishedAt: form.scheduledAt || null,
  }), [form, preferredContentLanguage]);

  async function loadNews({ preserveStatus = false } = {}) {
    setIsLoading(true);
    try {
      const result = await getAdminProjectNews(session.accessToken);
      setNews(result.news);
      if (!preserveStatus) setStatus('');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken]);

  function openNewEditor() {
    setEditingNewsId(null);
    setForm(emptyNewsForm());
    setStatus('');
    setIsEditorOpen(true);
  }

  function openEditEditor(item) {
    setEditingNewsId(item.id);
    setForm(formFromNews(item));
    setStatus('');
    setIsEditorOpen(true);
  }

  function closeEditor() {
    setIsEditorOpen(false);
    setEditingNewsId(null);
    setForm(emptyNewsForm());
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateTranslation(languageCode, field, value) {
    setForm((current) => ({
      ...current,
      translations: {
        ...current.translations,
        [languageCode]: {
          ...current.translations[languageCode],
          [field]: value,
        },
      },
    }));
  }

  async function saveNews(event) {
    event.preventDefault();
    const payload = formPayload(form);
    if (!payload.slug) return;
    setIsSaving(true);
    try {
      if (editingNewsId) {
        await updateAdminProjectNews(session.accessToken, editingNewsId, payload);
        setStatus(t('admin.projectNewsUpdated'));
      } else {
        await createAdminProjectNews(session.accessToken, payload);
        setStatus(payload.scheduled_at ? t('admin.projectNewsScheduled') : t('admin.projectNewsDrafted'));
      }
      closeEditor();
      await loadNews({ preserveStatus: true });
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function publishNews(item) {
    setIsSaving(true);
    try {
      await publishAdminProjectNews(session.accessToken, item.id);
      setStatus(t('admin.projectNewsPublished'));
      await loadNews({ preserveStatus: true });
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveNews(item) {
    setIsSaving(true);
    try {
      await archiveAdminProjectNews(session.accessToken, item.id);
      if (editingNewsId === item.id) closeEditor();
      setStatus(t('admin.projectNewsArchived'));
      await loadNews({ preserveStatus: true });
    } catch (err) {
      setStatus(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <header className="admin-page-heading">
        <div><p className="eyebrow">AraChat Web</p><h1>{t('admin.projectNewsTitle')}</h1><p>{t('admin.projectNewsText')}</p></div>
        <div className="project-news-heading-actions"><Button type="button" onClick={openNewEditor}>{t('admin.projectNewsNew')}</Button><button className="admin-icon-button" type="button" onClick={() => void loadNews()} aria-label={t('admin.refresh')} title={t('admin.refresh')}>↻</button></div>
      </header>

      {status ? <p className={status === t('admin.projectNewsUpdated') || status === t('admin.projectNewsScheduled') || status === t('admin.projectNewsDrafted') || status === t('admin.projectNewsPublished') || status === t('admin.projectNewsArchived') ? 'success-text project-news-status-text' : 'error-text project-news-status-text'}>{status}</p> : null}

      <div className="project-news-layout">
        {isEditorOpen ? (
          <form className="admin-surface project-news-editor" onSubmit={saveNews}>
            <header><div><h2>{editingNewsId ? t('admin.projectNewsEdit') : t('admin.projectNewsNew')}</h2><p>{t('admin.projectNewsEditorText')}</p></div><button type="button" className="admin-icon-button" onClick={closeEditor} aria-label={t('common.close')}>×</button></header>
            <label className="field"><span>{t('admin.projectNewsAddress')}</span><input className="text-input" value={form.slug} maxLength="64" placeholder="release-notes-september" onChange={(event) => updateForm('slug', event.target.value.toLowerCase())} /></label>
            <label className="field"><span>{t('admin.projectNewsSchedule')}</span><input className="text-input" type="datetime-local" value={form.scheduledAt} onChange={(event) => updateForm('scheduledAt', event.target.value)} /></label>
            {['ru', 'en'].map((languageCode) => (
              <fieldset className="project-news-language" key={languageCode}>
                <legend>{languageCode === 'ru' ? t('admin.projectNewsRussian') : t('admin.projectNewsEnglish')}</legend>
                <label className="field"><span>{t('admin.projectNewsHeadline')}</span><input className="text-input" value={form.translations[languageCode].title} maxLength="180" onChange={(event) => updateTranslation(languageCode, 'title', event.target.value)} /></label>
                <label className="field"><span>{t('admin.projectNewsExcerpt')}</span><textarea className="text-input" value={form.translations[languageCode].excerpt} maxLength="500" onChange={(event) => updateTranslation(languageCode, 'excerpt', event.target.value)} /></label>
                <label className="field"><span>{t('admin.projectNewsContent')}</span><textarea className="text-input" value={form.translations[languageCode].content} onChange={(event) => updateTranslation(languageCode, 'content', event.target.value)} placeholder={t('admin.projectNewsContentHint')} /></label>
              </fieldset>
            ))}
            <div className="project-news-editor-actions"><Button type="button" variant="secondary" onClick={closeEditor} disabled={isSaving}>{t('messages.cancel')}</Button><Button type="submit" disabled={isSaving}>{isSaving ? t('admin.projectNewsSaving') : t('admin.projectNewsSaveDraft')}</Button></div>
          </form>
        ) : (
          <section className="admin-surface project-news-editor project-news-intro"><h2>{t('admin.projectNewsReadyTitle')}</h2><p>{t('admin.projectNewsReadyText')}</p><Button type="button" onClick={openNewEditor}>{t('admin.projectNewsNew')}</Button></section>
        )}

        <section className="admin-surface project-news-preview">
          <p className="eyebrow">{t('admin.projectNewsPreview')}</p>
          <time>{preview.publishedAt ? formatDate(datetimeLocalToIso(preview.publishedAt), language) : t('admin.projectNewsDraftPreview')}</time>
          <h2>{preview.title || t('admin.projectNewsPreviewTitle')}</h2>
          <p className="project-news-preview-excerpt">{preview.excerpt || t('admin.projectNewsPreviewExcerpt')}</p>
          {preview.content.split(/\n\s*\n/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      </div>

      <section className="project-news-list admin-surface">
        <header><div><h2>{t('admin.projectNewsList')}</h2><p>{t('admin.projectNewsListText')}</p></div><span>{news.length}</span></header>
        {isLoading ? <AraChatLoader compact title={t('admin.projectNewsList')} text={t('admin.projectNewsLoading')} /> : <div className="project-news-cards">
          {news.map((item) => {
            const translation = translationFor(item, preferredContentLanguage);
            return <article className="project-news-card" key={item.id}>
              <div className="project-news-card-heading"><div><span>{item.slug}</span><h3>{translation?.title || t('admin.projectNewsUntitled')}</h3></div><b className={`project-news-status ${item.status}`}>{t(`admin.projectNewsStatuses.${item.status}`)}</b></div>
              <p>{translation?.excerpt || t('admin.projectNewsIncomplete')}</p>
              <small>{item.published_at ? t('admin.projectNewsPublishedAt').replace('{date}', formatDate(item.published_at, language)) : item.scheduled_at ? t('admin.projectNewsScheduledAt').replace('{date}', formatDate(item.scheduled_at, language)) : t('admin.projectNewsDraft')}</small>
              <div className="project-news-card-actions">
                {['draft', 'scheduled'].includes(item.status) ? <><Button type="button" variant="secondary" onClick={() => openEditEditor(item)} disabled={isSaving}>{t('admin.edit')}</Button><Button type="button" onClick={() => void publishNews(item)} disabled={isSaving}>{t('admin.projectNewsPublish')}</Button></> : null}
                {item.status === 'published' ? <Link className="button button-secondary" to={`/news/${item.slug}`} target="_blank" rel="noreferrer">{t('admin.projectNewsOpen')}</Link> : null}
                {item.status !== 'archived' ? <Button type="button" variant="danger" onClick={() => void archiveNews(item)} disabled={isSaving}>{t('admin.projectNewsArchive')}</Button> : null}
              </div>
            </article>;
          })}
          {!news.length ? <p className="admin-empty-state">{t('admin.projectNewsEmpty')}</p> : null}
        </div>}
      </section>
    </>
  );
}

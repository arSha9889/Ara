import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../../app/providers/I18nProvider.jsx';
import { getRegion, REGIONS } from '../region/regions.js';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';
import { PUBLIC_LANGUAGE_IDS } from './LanguagePicker.jsx';

export function RegionSelector({ country, onChange, resetsVerification = false, publicOnly = true }) {
  const { language, setLanguage, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [draftCountry, setDraftCountry] = useState(country);
  const [draftLanguage, setDraftLanguage] = useState(language);
  const triggerRef = useRef(null);
  const wasOpenRef = useRef(false);
  const selectedRegion = getRegion(country);
  const availableLanguages = (region) => (publicOnly ? PUBLIC_LANGUAGE_IDS : region.languages);
  const selectedLanguages = availableLanguages(selectedRegion);
  const selectedLanguage = selectedLanguages.includes(language) ? language : selectedLanguages[0];

  useEffect(() => {
    if (publicOnly && !PUBLIC_LANGUAGE_IDS.includes(language)) {
      setLanguage('ru');
    }
  }, [language, publicOnly, setLanguage]);

  useEffect(() => {
    if (!isOpen) return;
    const region = getRegion(country);
    const regionLanguages = availableLanguages(region);
    setDraftCountry(region.id);
    setDraftLanguage(regionLanguages.includes(language) ? language : regionLanguages[0]);
  }, [country, isOpen, language, publicOnly]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) triggerRef.current?.focus();
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  function selectRegion(region) {
    const regionLanguages = availableLanguages(region);
    setDraftCountry(region.id);
    setDraftLanguage((currentLanguage) => (
      regionLanguages.includes(currentLanguage) ? currentLanguage : regionLanguages[0]
    ));
  }

  function selectLanguage(region, nextLanguage) {
    setDraftCountry(region.id);
    setDraftLanguage(nextLanguage);
  }

  function applySelection() {
    onChange?.({ country: draftCountry, language: draftLanguage });
    setIsOpen(false);
  }

  return (
    <div className="auth-region-selector">
      <button
        className="auth-region-trigger"
        type="button"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={t('region.selectorLabel')}
        onClick={() => setIsOpen(true)}
      >
        <span className="auth-region-flag" aria-hidden="true">{selectedRegion.flag}</span>
        <span className="auth-region-copy">
          <small>{t('region.selectorLabel')}</small>
          <strong>{t(`region.${selectedRegion.id}.title`)} · {t(`region.languages.${selectedLanguage}`)}</strong>
        </span>
        <span className="auth-region-chevron" aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <div className="region-dialog-layer" role="presentation" onMouseDown={() => setIsOpen(false)}>
          <section className="region-dialog" role="dialog" aria-modal="true" aria-labelledby="region-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="region-dialog-handle" aria-hidden="true" />
            <div className="region-dialog-heading">
              <span className="region-dialog-icon" aria-hidden="true"><Icon name="globe" size={21} /></span>
              <div>
                <p className="eyebrow">AraChat</p>
                <h2 id="region-dialog-title">{t('region.pickerTitle')}</h2>
                <p>{t('region.pickerText')}</p>
              </div>
            </div>
            <button className="region-dialog-close" type="button" onClick={() => setIsOpen(false)} aria-label={t('common.close')}><Icon name="x" size={19} /></button>
            <div className="region-picker-options" role="list" aria-label={t('region.selectorLabel')}>
              {REGIONS.map((region) => {
                const isSelected = region.id === draftCountry;
                return (
                  <article className={`region-picker-option ${isSelected ? 'active' : ''}`} key={region.id} role="listitem">
                    <button className="region-picker-select" type="button" onClick={() => selectRegion(region)} aria-pressed={isSelected}>
                      <span className="region-picker-flag" aria-hidden="true">{region.flag}</span>
                      <span className="region-picker-copy">
                        <strong>{t(`region.${region.id}.title`)}</strong>
                        <small>{t(`region.${region.id}.text`)}</small>
                      </span>
                      {isSelected ? <span className="region-picker-check" aria-label={t('region.selected')}><Icon name="check" size={17} /></span> : null}
                    </button>
                    <div className="region-picker-languages" aria-label={t('region.languagesLabel')}>
                      {availableLanguages(region).map((regionLanguage) => (
                        <button
                          className={region.id === draftCountry && regionLanguage === draftLanguage ? 'active' : ''}
                          type="button"
                          key={regionLanguage}
                          onClick={() => selectLanguage(region, regionLanguage)}
                          aria-pressed={region.id === draftCountry && regionLanguage === draftLanguage}
                        >
                          {t(`region.languages.${regionLanguage}`)}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
            {resetsVerification && draftCountry !== country ? <p className="region-dialog-warning"><Icon name="shield" size={17} />{t('region.verificationChangeWarning')}</p> : null}
            {publicOnly ? <p className="region-dialog-warning region-language-notice"><Icon name="settings" size={17} />{t('settings.publicLanguageNotice')}</p> : null}
            <div className="region-dialog-actions">
              <Button type="button" onClick={applySelection}>{t('region.apply')}</Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

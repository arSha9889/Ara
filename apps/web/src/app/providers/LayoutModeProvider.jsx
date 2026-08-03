import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';

const LAYOUT_MODE_STORAGE_KEY = 'nexus_layout_mode';
const LAYOUT_MODES = ['auto', 'desktop', 'tablet', 'mobile'];
const LayoutModeContext = createContext(null);

function getPlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  const isIPadOS = /iPad/i.test(platform)
    || /iPad/i.test(userAgent)
    || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIPadOS) return 'ipados';
  if (/iPhone|iPod/i.test(platform) || /iPhone|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(platform) || /Android/i.test(userAgent)) return 'android';
  return 'other';
}

function getDisplayMode() {
  if (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true) return 'standalone';
  return 'browser';
}

function normalizeMode(value) {
  return LAYOUT_MODES.includes(value) ? value : 'auto';
}

function getAutomaticMode() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isTouchFirst = window.matchMedia?.('(any-pointer: coarse)').matches ?? false;

  if (width >= 700 && width <= 1199 && height >= 700 && isTouchFirst) return 'tablet';
  if (width <= 860) return 'mobile';
  return 'desktop';
}

function getEffectiveMode(preference) {
  if (preference === 'auto') return getAutomaticMode();

  const canUseTablet = window.innerWidth >= 700 && window.innerHeight >= 700;
  if (preference === 'desktop') return window.innerWidth >= 960 ? 'desktop' : canUseTablet ? 'tablet' : 'mobile';
  if (preference === 'tablet') return canUseTablet ? 'tablet' : 'mobile';
  return 'mobile';
}

export function LayoutModeProvider({ children }) {
  const [preference, setPreferenceState] = useState(() => normalizeMode(localStorage.getItem(LAYOUT_MODE_STORAGE_KEY)));
  const [effectiveMode, setEffectiveMode] = useState(() => getEffectiveMode(preference));
  const [displayMode, setDisplayMode] = useState(getDisplayMode);
  const platform = useMemo(getPlatform, []);

  useEffect(() => {
    function syncEffectiveMode() {
      setEffectiveMode(getEffectiveMode(preference));
    }

    syncEffectiveMode();
    window.addEventListener('resize', syncEffectiveMode);
    window.addEventListener('orientationchange', syncEffectiveMode);
    return () => {
      window.removeEventListener('resize', syncEffectiveMode);
      window.removeEventListener('orientationchange', syncEffectiveMode);
    };
  }, [preference]);

  useEffect(() => {
    const standaloneQuery = window.matchMedia?.('(display-mode: standalone)');
    if (!standaloneQuery) return undefined;

    function syncDisplayMode() {
      setDisplayMode(getDisplayMode());
    }

    standaloneQuery.addEventListener?.('change', syncDisplayMode);
    standaloneQuery.addListener?.(syncDisplayMode);
    return () => {
      standaloneQuery.removeEventListener?.('change', syncDisplayMode);
      standaloneQuery.removeListener?.(syncDisplayMode);
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.layoutPreference = preference;
    document.documentElement.dataset.layoutMode = preference === 'auto' ? 'auto' : effectiveMode;
    document.documentElement.dataset.effectiveLayoutMode = effectiveMode;
    document.documentElement.dataset.platform = platform;
    document.documentElement.dataset.displayMode = displayMode;
  }, [displayMode, effectiveMode, platform, preference]);

  function setLayoutPreference(nextPreference) {
    const normalized = normalizeMode(nextPreference);
    localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, normalized);
    setPreferenceState(normalized);
  }

  const value = useMemo(() => ({
    preference,
    effectiveMode,
    platform,
    displayMode,
    isFallback: preference !== 'auto' && preference !== effectiveMode,
    setLayoutPreference,
  }), [displayMode, effectiveMode, platform, preference]);

  return <LayoutModeContext.Provider value={value}>{children}</LayoutModeContext.Provider>;
}

export function useLayoutMode() {
  const context = useContext(LayoutModeContext);
  if (!context) throw new Error('useLayoutMode must be used inside LayoutModeProvider');
  return context;
}

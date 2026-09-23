import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { useLayoutMode } from './LayoutModeProvider.jsx';

const DENSITY_STORAGE_KEY = 'nexus_density';
const DENSITIES = ['comfortable', 'compact'];
const DensityContext = createContext(null);

function normalizeDensity(value) {
  return DENSITIES.includes(value) ? value : 'comfortable';
}

export function DensityProvider({ children }) {
  const { effectiveMode } = useLayoutMode();
  const [preference, setPreferenceState] = useState(() => normalizeDensity(localStorage.getItem(DENSITY_STORAGE_KEY)));
  const effectiveDensity = effectiveMode === 'mobile' ? 'comfortable' : preference;

  useLayoutEffect(() => {
    document.documentElement.dataset.density = effectiveDensity;
  }, [effectiveDensity]);

  function setDensityPreference(nextPreference) {
    const normalized = normalizeDensity(nextPreference);
    localStorage.setItem(DENSITY_STORAGE_KEY, normalized);
    setPreferenceState(normalized);
  }

  const value = useMemo(() => ({
    preference,
    effectiveDensity,
    isFallback: preference !== effectiveDensity,
    setDensityPreference,
  }), [effectiveDensity, preference]);

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useDensity() {
  const context = useContext(DensityContext);
  if (!context) throw new Error('useDensity must be used inside DensityProvider');
  return context;
}

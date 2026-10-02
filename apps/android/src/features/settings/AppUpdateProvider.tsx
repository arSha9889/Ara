import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { androidInstallSource, appVersionCode, type AndroidInstallSource } from '../../config/runtimeConfig';
import { useSession } from '../auth/session/useSession';
import { getAndroidRelease, type AndroidRelease } from './updateApi';

interface AppUpdateContextValue {
  dismissBanner(): void;
  isBannerDismissed: boolean;
  isUpdateAvailable: boolean;
  release: AndroidRelease | null;
  source: AndroidInstallSource;
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const currentVersionCode = appVersionCode();
  const isUpdateAvailable = Boolean(
    release && currentVersionCode !== null && release.latestVersionCode > currentVersionCode,
  );
  const source = androidInstallSource(release?.rustoreInstallerPackage ?? null);

  useEffect(() => {
    let active = true;

    setIsBannerDismissed(false);
    getAndroidRelease()
      .then(nextRelease => {
        if (active) {
          setRelease(nextRelease);
        }
      })
      .catch(() => {
        if (active) {
          setRelease(null);
        }
      });

    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  const value = useMemo(
    () => ({
      dismissBanner: () => setIsBannerDismissed(true),
      isBannerDismissed,
      isUpdateAvailable,
      release,
      source,
    }),
    [isBannerDismissed, isUpdateAvailable, release, source],
  );

  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

export function useAppUpdate(): AppUpdateContextValue {
  const context = useContext(AppUpdateContext);

  if (!context) {
    throw new Error('useAppUpdate должен использоваться внутри AppUpdateProvider.');
  }

  return context;
}

import { useEffect, useState } from 'react';

// 24 August 2026, 23:59:59.999 in Moscow (UTC+3).
export const FLAG_DAY_CAMPAIGN_END = Date.UTC(2026, 7, 24, 20, 59, 59, 999);

export function isFlagDayCampaignActive(currentTimestamp = Date.now()) {
  return currentTimestamp <= FLAG_DAY_CAMPAIGN_END;
}

export function useFlagDayCampaign() {
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now);
  const isActive = isFlagDayCampaignActive(currentTimestamp);

  useEffect(() => {
    if (!isActive) return undefined;

    const timeoutId = window.setTimeout(() => {
      setCurrentTimestamp(Date.now());
    }, Math.min(Math.max(0, FLAG_DAY_CAMPAIGN_END - Date.now()) + 20, 2_147_483_647));

    return () => window.clearTimeout(timeoutId);
  }, [currentTimestamp, isActive]);

  return isActive;
}

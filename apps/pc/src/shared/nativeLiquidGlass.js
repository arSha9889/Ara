import { invoke, isTauri } from '@tauri-apps/api/core';

export async function initializeNativeLiquidGlass() {
  if (!isTauri()) return false;

  try {
    return await invoke('initialize_native_liquid_glass');
  } catch {
    return false;
  }
}

import { isTauri } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';

import { downloadProgressPercent } from './updateProgress.js';

export function desktopUpdaterIsAvailable() {
  return isTauri();
}

export async function checkDesktopUpdate() {
  if (!desktopUpdaterIsAvailable()) return { status: 'unavailable' };

  const nativeUpdate = await check();
  if (!nativeUpdate) return { status: 'up-to-date' };

  return {
    status: 'available',
    nativeUpdate,
    update: {
      version: nativeUpdate.version,
    },
  };
}

export async function downloadDesktopUpdate(nativeUpdate, onProgress) {
  if (!desktopUpdaterIsAvailable() || !nativeUpdate) throw new Error('Desktop updater is unavailable');

  let downloadedBytes = 0;
  let contentLength = 0;
  await nativeUpdate.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      contentLength = Number(event.data.contentLength) || 0;
      onProgress?.({
        downloadedBytes,
        contentLength,
        percent: downloadProgressPercent(downloadedBytes, contentLength),
      });
      return;
    }

    if (event.event === 'Progress') {
      downloadedBytes += Number(event.data.chunkLength) || 0;
      onProgress?.({
        downloadedBytes,
        contentLength,
        percent: downloadProgressPercent(downloadedBytes, contentLength),
      });
    }
  });
}

export async function relaunchDesktop() {
  if (!desktopUpdaterIsAvailable()) throw new Error('Desktop updater is unavailable');
  await relaunch();
}

import { apiClient } from '../../infrastructure/http/apiClient';

export interface AndroidRelease {
  latestVersionCode: number;
  latestVersionName: string;
  releaseNotes: string[];
  directDownloadUrl: string | null;
  rustoreAppUrl: string | null;
  rustoreInstallerPackage: string | null;
}

interface AndroidReleaseResponse {
  latest_version_code?: unknown;
  latest_version_name?: unknown;
  release_notes?: unknown;
  direct_download_url?: unknown;
  rustore_app_url?: unknown;
  rustore_installer_package?: unknown;
}

interface OptionalHttpsUrl {
  isValid: boolean;
  value: string | null;
}

function optionalHttpsUrl(value: unknown): OptionalHttpsUrl {
  if (value === undefined || value === null || value === '') {
    return { isValid: true, value: null };
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return { isValid: false, value: null };
  }

  try {
    const url = new URL(value.trim());
    const isValid =
      url.protocol === 'https:' &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash;
    return { isValid, value: isValid ? url.toString() : null };
  } catch {
    return { isValid: false, value: null };
  }
}

function rustoreInstallerPackage(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value)
    ? value
    : null;
}

function releaseNotes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const notes = value.map(note => (typeof note === 'string' ? note.trim() : ''));
  return notes.every(Boolean) ? notes : null;
}

export async function getAndroidRelease(): Promise<AndroidRelease | null> {
  const response = await apiClient.request<AndroidReleaseResponse>('/api/releases/android');
  const directDownloadUrl = optionalHttpsUrl(response.direct_download_url);
  const rustoreAppUrl = optionalHttpsUrl(response.rustore_app_url);
  const latestVersionCode = response.latest_version_code;
  const latestVersionName =
    typeof response.latest_version_name === 'string'
      ? response.latest_version_name.trim()
      : '';
  const notes = releaseNotes(response.release_notes);

  if (
    typeof latestVersionCode !== 'number' ||
    !Number.isSafeInteger(latestVersionCode) ||
    latestVersionCode < 1 ||
    !latestVersionName ||
    !notes ||
    !directDownloadUrl.isValid ||
    !rustoreAppUrl.isValid ||
    (!directDownloadUrl.value && !rustoreAppUrl.value)
  ) {
    return null;
  }

  return {
    latestVersionCode,
    latestVersionName,
    releaseNotes: notes,
    directDownloadUrl: directDownloadUrl.value,
    rustoreAppUrl: rustoreAppUrl.value,
    rustoreInstallerPackage: rustoreInstallerPackage(response.rustore_installer_package),
  };
}

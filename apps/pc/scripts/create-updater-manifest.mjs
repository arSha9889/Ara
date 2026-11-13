import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLATFORM_ARTIFACTS = [
  { key: 'windows-x86_64', suffix: '.exe' },
  { key: 'darwin-aarch64', suffix: '.app.tar.gz' },
];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(entryPath);
    return entry.isFile() ? [entryPath] : [];
  }));
  return files.flat();
}

function validatedBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('The updater base URL must be an HTTPS URL without credentials, query, or fragment.');
  }
  return url.toString().replace(/\/?$/, '/');
}

function artifactForPlatform(files, platform) {
  const candidates = files.filter((file) => file.endsWith(platform.suffix));
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one ${platform.key} updater artifact, found ${candidates.length}.`);
  }
  return candidates[0];
}

export async function createUpdaterManifest({ artifactsDirectory, baseUrl, notes = '', publishedAt = new Date(), version }) {
  if (typeof version !== 'string' || !version.trim()) throw new Error('A release version is required.');
  const artifactFiles = await filesIn(artifactsDirectory);
  const platforms = {};

  for (const platform of PLATFORM_ARTIFACTS) {
    const candidates = artifactFiles.filter((file) => file.endsWith(platform.suffix));
    if (!candidates.length) continue;
    const artifactPath = artifactForPlatform(artifactFiles, platform);
    const signaturePath = `${artifactPath}.sig`;
    if (!(await stat(signaturePath).catch(() => null))?.isFile()) {
      throw new Error(`Missing signature for ${relative(artifactsDirectory, artifactPath)}.`);
    }

    const filename = relative(artifactsDirectory, artifactPath).split('/').map(encodeURIComponent).join('/');
    const signature = (await readFile(signaturePath, 'utf8')).trim();
    if (!signature) throw new Error(`The signature for ${relative(artifactsDirectory, artifactPath)} is empty.`);
    platforms[platform.key] = { url: new URL(filename, baseUrl).toString(), signature };
  }

  if (!Object.keys(platforms).length) throw new Error('No supported updater artifacts were found.');

  return {
    version,
    notes,
    pub_date: publishedAt.toISOString(),
    platforms,
  };
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] ?? '';
}

async function main() {
  const artifactsDirectory = optionValue('--artifacts-dir');
  const outputPath = optionValue('--output');
  const baseUrl = optionValue('--base-url');
  const notes = optionValue('--notes');
  const version = optionValue('--version');
  if (!artifactsDirectory || !outputPath || !baseUrl || !version) {
    throw new Error('Usage: node create-updater-manifest.mjs --artifacts-dir <dir> --output <file> --base-url <https-url> --version <SemVer> [--notes <text>]');
  }

  const manifest = await createUpdaterManifest({
    artifactsDirectory,
    baseUrl: validatedBaseUrl(baseUrl),
    notes,
    version,
  });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

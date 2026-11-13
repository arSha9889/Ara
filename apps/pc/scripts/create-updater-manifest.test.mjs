import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createUpdaterManifest } from './create-updater-manifest.mjs';

async function fixtureDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'arachat-updater-'));
  await mkdir(join(directory, 'artifacts'));
  return directory;
}

test('создаёт статический манифест для Windows и macOS из подписанных артефактов', async () => {
  const directory = await fixtureDirectory();
  const artifactsDirectory = join(directory, 'artifacts');
  await writeFile(join(artifactsDirectory, 'AraChat_0.9.4_x64-setup.exe'), 'windows update');
  await writeFile(join(artifactsDirectory, 'AraChat_0.9.4_x64-setup.exe.sig'), 'windows signature\n');
  await writeFile(join(artifactsDirectory, 'AraChat.app.tar.gz'), 'macOS update');
  await writeFile(join(artifactsDirectory, 'AraChat.app.tar.gz.sig'), 'macOS signature\n');

  const manifest = await createUpdaterManifest({
    artifactsDirectory,
    baseUrl: 'https://aramsg.ru/desktop-updates/',
    notes: 'Исправления.',
    publishedAt: new Date('2026-11-13T00:00:00.000Z'),
    version: '0.9.4',
  });

  assert.equal(manifest.version, '0.9.4');
  assert.equal(manifest.pub_date, '2026-11-13T00:00:00.000Z');
  assert.deepEqual(manifest.platforms, {
    'windows-x86_64': {
      url: 'https://aramsg.ru/desktop-updates/AraChat_0.9.4_x64-setup.exe',
      signature: 'windows signature',
    },
    'darwin-aarch64': {
      url: 'https://aramsg.ru/desktop-updates/AraChat.app.tar.gz',
      signature: 'macOS signature',
    },
  });
});

test('не создаёт манифест без подписи артефакта', async () => {
  const directory = await fixtureDirectory();
  const artifactsDirectory = join(directory, 'artifacts');
  await writeFile(join(artifactsDirectory, 'AraChat_0.9.4_x64-setup.exe'), 'windows update');

  await assert.rejects(
    createUpdaterManifest({ artifactsDirectory, baseUrl: 'https://aramsg.ru/desktop-updates/', version: '0.9.4' }),
    /Missing signature/,
  );
});

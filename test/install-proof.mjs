// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
// Install and compose a disposable profile; never boot the live web service.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const tarball = resolve(process.argv[2] ?? 'dsh-adaptive-reasoning-0.2.0.tgz');
const home = mkdtempSync(join(tmpdir(), 'dsh-adaptive-install-'));
const env = { ...process.env, DSH_HOME: home };
function run(args) {
  const result = spawnSync('dsh', args, { env, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Disposable DSH command failed (${result.status}): ${result.stderr?.slice(-1500)}`);
  return result.stdout;
}
try {
  run(['plugin', '--profile', 'web', 'add', tarball, '--offline', '--ignore-scripts', '--config.auto-install-peers=false']);
  const path = join(home, 'profiles/web');
  const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
  assert.equal(manifest.dsh.profile.bundles.filter(n => n === 'dsh-adaptive-reasoning').length, 1);
  const installed = JSON.parse(readFileSync(join(path, 'node_modules/dsh-adaptive-reasoning/package.json'), 'utf8'));
  assert.equal(installed.version, '0.2.0');
  const composition = run(['--profile', 'web', '--dump-config']);
  assert.ok(composition.includes('adaptive-reasoning'));
  assert.ok(composition.includes('augmentor-linux-product'));
  run(['plugin', '--profile', 'web', 'remove', 'dsh-adaptive-reasoning', '--config.ignore-scripts=true', '--config.auto-install-peers=false']);
  const removed = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
  assert.equal(removed.dsh.profile.bundles.includes('dsh-adaptive-reasoning'), false);
  console.log('PASS: local tarball installation, one bundle mount, profile composition and removal in disposable DSH home.');
} finally { rmSync(home, { recursive: true, force: true }); }

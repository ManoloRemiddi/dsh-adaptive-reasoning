#!/usr/bin/env node
// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
// Read existing measurements only. This command performs no inference or polling.
import { readdir, stat, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { telemetryPath } from '../src/telemetry.js';
import { existsSync } from 'node:fs';

const root = process.argv[2] ?? join(homedir(), '.dsh/sessions');
async function files(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) result.push(...await files(path));
    else if (/session(?:\.v3)?\.jsonl(?:\.zstd)?$/.test(item.name)) result.push(path);
  }
  return result;
}
const candidates = process.argv[2] ? await files(root) : [telemetryPath(), telemetryPath()+'.1'].filter(existsSync);
const dated = await Promise.all(candidates.map(async path => ({ path, time: (await stat(path)).mtimeMs })));
const buckets = new Map();
let unreadable = 0;
for (const { path } of dated.sort((a, b) => b.time - a.time).slice(0, 100)) {
  let raw;
  try {
    raw = path.endsWith('.zstd') ? execFileSync('zstd', ['-dc', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }) : await readFile(path, 'utf8');
  } catch { unreadable++; continue; }
  for (const line of raw.split('\n')) {
    if (!line.includes('"adaptive-reasoning/measurement"')) continue;
    let entry; try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'adaptive-reasoning/measurement') continue;
    const m = entry.data;
    if (!['off', 'low', 'medium', 'high'].includes(m.tier) || !Number.isFinite(m.durationMs)) continue;
    if (!buckets.has(m.tier)) buckets.set(m.tier, []);
    buckets.get(m.tier).push(m);
  }
}
console.log('Adaptive reasoning: passive measurements (separate diagnostics by default)');
if (!buckets.size) console.log('No measurements yet. The plugin may be awaiting reload, or no configured task has run.');
else {
  const median = values => { const sorted = values.sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; };
  console.log('| Effort | Requests | Median completion | Median first answer |');
  console.log('| --- | ---: | ---: | ---: |');
  for (const [tier, rows] of buckets) {
    const textTimes = rows.map(r => r.firstTextMs).filter(Number.isFinite);
    console.log(`| ${tier} | ${rows.length} | ${(median(rows.map(r => r.durationMs)) / 1000).toFixed(2)} s | ${textTimes.length ? (median(textTimes) / 1000).toFixed(2) + ' s' : 'not recorded'} |`);
  }
  console.log('Task mix and server load differ. These are observations, not causal savings or electricity measurements.');
}
if (unreadable) console.log(`${unreadable} file(s) could not be read; no contents or paths displayed.`);

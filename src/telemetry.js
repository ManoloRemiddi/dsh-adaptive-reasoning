// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
// Diagnostics must never enter the harness's replayable conversation vocabulary.
import { appendFileSync, mkdirSync, statSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const recent = new WeakMap();
let warned = false;
export const telemetryPath = () => join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local/state'), 'dsh-adaptive-reasoning/telemetry.jsonl');
export const recordsFor = session => structuredClone(recent.get(session) ?? []);
export function record(session, type, data) {
  const event = { type, time: Date.now(), sessionId: session.header.id, data };
  recent.set(session, [...(recent.get(session) ?? []).slice(-127), event]);
  try {
    const path = telemetryPath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try { if (statSync(path).size > 5 * 1024 * 1024) renameSync(path, path + '.1'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    appendFileSync(path, JSON.stringify(event) + '\n', { mode: 0o600 });
  } catch {
    // Optional diagnostics (including disk-full failures) cannot break a turn.
    if (!warned) { warned = true; console.error('Adaptive reasoning diagnostics unavailable; conversation continues.'); }
  }
}

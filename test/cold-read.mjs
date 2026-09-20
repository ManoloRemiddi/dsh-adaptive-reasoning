// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
// Separate process: no in-memory session cache or plugin registration survives.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const req = createRequire(join(process.env.DSH_INSTALL_ROOT ?? join(homedir(), '.local/node/lib/node_modules/@deepseek-ai/dsh'), 'package.json'));
const load = async name => import(pathToFileURL(req.resolve('@deepseek-ai/' + name)).href);
const { Context } = await load('cordis');
const ctx = new Context();
try {
  for (const name of ['dsh-session-projection', 'dsh-session', 'dsh-session-persistence-jsonl']) {
    const mod = await load(name);
    await ctx.plugin(mod.default ?? mod, name.endsWith('-jsonl') ? { root: process.argv[2] } : {}).await();
  }
  const rows = await ctx.sessionPersistence.list();
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const handle = await ctx.sessionPersistence.open(row.header.id, 'read');
    try {
      const { events } = await handle.read();
      assert.ok(events.some(e => e.type === 'assistant/message'));
      assert.ok(events.some(e => e.type === 'request/header'));
      assert.ok(!events.some(e => e.type.startsWith('adaptive-reasoning/')));
      assert.equal(events.at(-1).type, 'turn/end');
    } finally { await handle.close(); }
  }
  console.log('PASS: two real compressed DSH histories reopen in a fresh process with the adaptive plugin absent.');
} finally { await ctx.fiber.dispose(); }

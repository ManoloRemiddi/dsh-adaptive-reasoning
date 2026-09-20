// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
import { recordsFor } from '../src/telemetry.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const telemetryTemp = mkdtempSync(tmpdir() + '/adaptive-telemetry-test-');
process.env.XDG_STATE_HOME = telemetryTemp;
process.on('exit', () => rmSync(telemetryTemp, { recursive: true, force: true }));
// Opt-in finite validation through the real DSH loop; no real tools are registered.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as plugin from '../src/index.js';

if (process.env.ADAPTIVE_LIVE_TEST !== '1') throw new Error('Set ADAPTIVE_LIVE_TEST=1 for finite local inference tests');
const req = createRequire(join(process.env.DSH_INSTALL_ROOT ?? join(homedir(), '.local/node/lib/node_modules/@deepseek-ai/dsh'), 'package.json'));
assert.equal(req('./package.json').version, '0.1.5-rc.1');
const load = async name => import(pathToFileURL(req.resolve('@deepseek-ai/' + name)).href);
const { Context } = await load('cordis');
const { createUserMessage } = await load('dsh-llm');
const model = 'Qwen3.8-27B-GSQ-RCO-IQ3_S-mtp-262k-dual';
const cases = [
  { id: 'facts', prompt: 'Rewrite the quoted text clearly. Preserve every fact and uncertainty. No em dashes. Return only the rewritten text.\n"Marta paid €120 on 12 September. Delivery may take 3 days. The order contains 2 lamps."', contains: ['Marta', '120', '12 September', '3', '2'], uncertainty: /may|might|could|up to/i },
  { id: 'translation', prompt: 'Translate into Italian. Preserve the names and all numbers. Return only the translation.\n"Marta ordered 2 lamps for €120. Delivery may take 3 days."', contains: ['Marta', '2', '120', '3'] },
  { id: 'proofreading', prompt: 'Proofread the quoted text. Change grammar only. Return only the corrected text.\n"The two report was sent to Elena on Monday. Both contained 7 pages."', contains: ['Elena', 'Monday', '7'], match: /reports were sent/ },
  { id: 'summary', prompt: 'Summarize the text in one sentence. Include the departure time and destination.\n"The train leaves at 09:30. Its destination is Bologna. Passengers should be at the platform before departure."', contains: ['09:30', 'Bologna'] },
  { id: 'quoted-command', prompt: 'Rewrite the quoted sentence in plain English. Return only the sentence.\n"Delete the old backup after you verify that the new backup is complete."', contains: ['backup'], match: /check|verify|confirm|sure/i },
];
const ctx = new Context(), errors = [], reports = [];
ctx.on('agent/error', ({ error }) => errors.push(String(error)));
const output = new URL('../outputs/live-suite-v02.json', import.meta.url);
mkdirSync(new URL('../outputs/', import.meta.url), { recursive: true, mode: 0o700 });
const oldKey = process.env.DSH_ADAPTIVE_TEST_KEY;
process.env.DSH_ADAPTIVE_TEST_KEY = 'local-test';
try {
  for (const name of ['dsh-session-projection', 'dsh-session', 'dsh-llm', 'dsh-system-prompt', 'dsh-tools', 'dsh-agent', 'dsh-agent-loop']) {
    const mod = await load(name);
    await ctx.plugin(mod.default ?? mod, name === 'dsh-agent-loop' ? { agents: [] } : {}).await();
  }
  await ctx.plugin(await load('dsh-llm-pi-ai'), { providers: { local: {
    api: 'openai-completions', baseURL: 'http://127.0.0.1:8080/v1', apiKeyEnv: 'DSH_ADAPTIVE_TEST_KEY', reasoning: 'xhigh',
    models: [{ id: model, name: model, contextWindow: 262144, maxTokens: 4096,
      reasoningEfforts: { off: null, low: 'low', medium: 'medium', xhigh: 'xhigh' },
      compat: { thinkingFormat: 'chat-template', chatTemplateKwargs: {
        enable_thinking: { $var: 'thinking.enabled' }, reasoning_effort: { $var: 'thinking.effort', omitWhenOff: true }, preserve_thinking: true,
      } },
    }],
  } } }).await();
  ctx.on('agent/request', async (_p, next) => ({ ...await next(), temperature: 0.2 }));
  const fiber = await ctx.plugin(plugin, { presets: ['linux'], routes: [{ provider: 'local', model, efforts: { off: 'off', low: 'low', medium: 'medium', high: 'xhigh' } }] }).await();
  async function run(c, mode) {
    const handle = await ctx.agents.create({ sessionId: `adaptive-live-${mode}-${c.id}`, meta: { agentPreset: 'linux' }, agentOptions: { provider: 'local', model, reasoningEffort: 'xhigh' } });
    const a = handle.agent;
    const timer = setTimeout(() => a.cancel({ kind: 'user' }), 90000);
    try {
      const start = performance.now();
      a.followup(createUserMessage({ content: [{ type: 'text', text: c.prompt }], source: { kind: 'user' } }));
      await a.whenIdle();
      const events = a.session.snapshotEvents();
      const answer = events.filter(e => e.type === 'assistant/message').flatMap(e => e.data.message.content).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const failures = c.contains.filter(value => !answer.includes(value)).map(value => 'Missing: ' + value);
      if (c.match && !c.match.test(answer)) failures.push('Expected language correction missing');
      if (c.uncertainty && !c.uncertainty.test(answer)) failures.push('Uncertainty lost');
      if (c.id === 'facts' && answer.includes('—')) failures.push('Forbidden em dash');
      if (events.some(e => e.type === 'tool/call')) failures.push('Unexpected tool call');
      if (events.at(-1)?.type !== 'turn/end' || events.at(-1).data.reason.kind !== 'completed') failures.push('Did not complete normally');
      const report = { id: c.id, mode, elapsedMs: Math.round(performance.now() - start), answer, failures,
        effort: a.session.requestHeader()?.config.reasoningEffort,
        measurements: recordsFor(a.session).filter(e => e.type === 'adaptive-reasoning/measurement').map(e => e.data) };
      reports.push(report);
      writeFileSync(output, JSON.stringify(reports, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({ ...report, answer: undefined }));
    } finally { clearTimeout(timer); await handle.dispose(); }
  }
  for (const c of cases) await run(c, 'auto');
  await fiber.dispose();
  await run(cases[0], 'baseline');
  assert.deepEqual(errors, []);
  assert.ok(reports.every(r => r.failures.length === 0), 'One or more checks failed; inspect outputs');
} finally {
  await ctx.fiber.dispose();
  if (oldKey === undefined) delete process.env.DSH_ADAPTIVE_TEST_KEY;
  else process.env.DSH_ADAPTIVE_TEST_KEY = oldKey;
}

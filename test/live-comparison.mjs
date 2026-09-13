// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
// Explicit opt-in replay of supplied text-only session files to an already running
// local model. No tools execute. Private source text/output stays in ignored outputs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { classify, editingGuidance } from '../src/policy.js';
import assert from 'node:assert/strict';

if (process.env.ADAPTIVE_LIVE_TEST !== '1' || process.argv.length < 3)
  throw new Error('Opt in with ADAPTIVE_LIVE_TEST=1 and supply source session.zstd paths');
const outputDir = new URL('../outputs/', import.meta.url);
mkdirSync(outputDir, { recursive: true, mode: 0o700 });
const reports = [];
for (const file of process.argv.slice(2)) {
  const events = execFileSync('zstd', ['-dc', file], { encoding: 'utf8' }).trim().split('\n').map(JSON.parse);
  const firstResponse = events.findIndex(e => e.type === 'assistant/message');
  const before = events.slice(0, firstResponse);
  const header = before.find(e => e.type === 'request/header').data.header;
  const messages = before.filter(e => ['user/message', 'system/message'].includes(e.type)).map(e => e.data.message ?? e.data)
    .map(m => ({ role: m.role, content: m.content.map(c => c.text ?? '').join('\n') }));
  const user = before.find(e => e.type === 'user/message' && e.data.source?.kind === 'user').data;
  const decision = classify(user.content.map(c => c.text).join('\n'));
  assert.ok(decision.textOnly, 'Only bounded text replay is supported');
  if (process.env.ADAPTIVE_EFFORT) {
    assert.ok(['off', 'low', 'medium', 'xhigh'].includes(process.env.ADAPTIVE_EFFORT));
    decision.tier = process.env.ADAPTIVE_EFFORT;
  }
  const textOnly = process.env.ADAPTIVE_TEXT_ONLY === '1';
  if (textOnly) {
    const system = messages.find(m => m.role === 'system');
    if (system) system.content += '\n\n' + editingGuidance(decision.family);
  }
  const body = { model: header.config.model, messages, ...(textOnly ? {} : { tools: header.tools.map(t => ({ type: 'function', function: t })) }),
    stream: true, stream_options: { include_usage: true }, max_tokens: 8192,
    chat_template_kwargs: { enable_thinking: decision.tier !== 'off', preserve_thinking: true,
      ...(decision.tier === 'off' ? {} : { reasoning_effort: decision.tier }) } };
  const start = performance.now();
  const response = await fetch('http://127.0.0.1:8080/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000),
  });
  assert.equal(response.status, 200);
  let buffer = '', text = '', reasoning = '', firstTextMs = null, usage, finish;
  const decoder = new TextDecoder();
  const toolCalls = [];
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      const data = JSON.parse(line.slice(6));
      const choice = data.choices?.[0];
      if (choice?.delta?.tool_calls?.length) toolCalls.push(...choice.delta.tool_calls);
      if (choice?.delta?.content) { firstTextMs ??= performance.now() - start; text += choice.delta.content; }
      reasoning += choice?.delta?.reasoning_content ?? '';
      if (data.usage) usage = data.usage;
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
  }
  const report = { task: decision.reason, tier: decision.tier, textOnly, elapsedMs: performance.now() - start, firstTextMs,
    reasoningWords: reasoning.trim() ? reasoning.trim().split(/\s+/).length : 0,
    answerWords: text.trim() ? text.trim().split(/\s+/).length : 0, usage, finish, answer: text, toolCalls };
  reports.push(report);
  writeFileSync(new URL(`live-v02-${textOnly ? 'text-only' : 'comparison'}-${process.env.ADAPTIVE_EFFORT ?? 'auto'}.json`, outputDir), JSON.stringify(reports, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...report, answer: undefined, toolCalls: toolCalls.map(t => t.function?.name).filter(Boolean) }));
}

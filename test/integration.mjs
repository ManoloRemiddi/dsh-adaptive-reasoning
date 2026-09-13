// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
// Runs the installed, pinned DSH loop in memory with a deterministic adapter.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import * as plugin from '../src/index.js';
const req = createRequire(join(process.env.DSH_INSTALL_ROOT ?? join(homedir(), '.local/node/lib/node_modules/@deepseek-ai/dsh'), 'package.json'));
assert.equal(req('./package.json').version, '0.1.5-rc.1');
const load = async name => import(pathToFileURL(req.resolve('@deepseek-ai/' + name)).href);
const { Context } = await load('cordis');
const { createUserMessage } = await load('dsh-llm');
const { installModelSelection } = await load('dsh-agent');
const ctx = new Context();
const errors = [];
ctx.on('agent/error', ({ error }) => errors.push(error));
const calls = [];
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  calls.push(JSON.parse(body));
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const parsed = JSON.parse(body);
  const attemptTool = body.includes('TRIGGER_GUARD') && !parsed.messages.some(m => m.role === 'tool');
  const delta = attemptTool ? { role: 'assistant', tool_calls: [{ index: 0, id: 'guard-tool', type: 'function', function: { name: 'test_tool', arguments: '{}' } }] } : { role: 'assistant', content: 'Done.' };
  response.end('data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'qwen', choices: [{ index: 0, delta, finish_reason: attemptTool ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
process.env.DSH_ADAPTIVE_TEST_KEY = 'test-only';
try {
  for (const name of ['dsh-session-projection', 'dsh-session', 'dsh-llm', 'dsh-system-prompt', 'dsh-tools', 'dsh-agent', 'dsh-agent-loop']) {
    const mod = await load(name);
    await ctx.plugin(mod.default ?? mod, name === 'dsh-agent-loop' ? { agents: [] } : {}).await();
  }
  await ctx.plugin(await load('dsh-llm-pi-ai'), { providers: { local: {
    api: 'openai-completions', baseURL: `http://127.0.0.1:${server.address().port}/v1`,
    apiKeyEnv: 'DSH_ADAPTIVE_TEST_KEY', reasoning: 'xhigh',
    models: [{ id: 'qwen', name: 'qwen', contextWindow: 262144, maxTokens: 65536,
      reasoningEfforts: { off: null, low: 'low', medium: 'medium', xhigh: 'xhigh' },
      compat: { thinkingFormat: 'chat-template', chatTemplateKwargs: {
        enable_thinking: { $var: 'thinking.enabled' },
        reasoning_effort: { $var: 'thinking.effort', omitWhenOff: true }, preserve_thinking: true,
      } },
    }],
  } } }).await();
  const pluginFiber = await ctx.plugin(plugin, { presets: ['linux'], routes: [{ provider: 'local', model: 'qwen', efforts: { off: 'off', low: 'low', medium: 'medium', high: 'xhigh' } }] }).await();
  let executed = 0;
  ctx.tools.register({ name: 'test_tool', description: 'Test tool', parameters: { type: 'object', properties: {} }, output: { schema: {}, render: () => [{ type: 'text', text: 'test' }] }, execute: async () => { executed++; return {}; } });
  const handle = await ctx.agents.create({ sessionId: 'adaptive-integration', meta: { agentPreset: 'linux' },
    agentOptions: { provider: 'local', model: 'qwen', reasoningEffort: 'xhigh' },
    setup(agentCtx) { installModelSelection(agentCtx, { current: { provider: 'local', model: 'qwen', reasoningEffort: 'xhigh' } }); }
  });
  const agent = handle.agent;
  for (const text of ['Rewrite the quoted text.\n"Hello."', 'You are an expert prompt engineer. Improve my prompt.\nHere is my prompt: Help me plan a picnic.', 'Diagnose the production outage.']) {
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
    await agent.whenIdle();
  }
  assert.deepEqual(errors, []);
  assert.equal(agent.session.snapshotEvents().filter(e => e.type === 'turn/end' && e.data.reason.kind === 'completed').length, 3);
  assert.deepEqual(calls.map(c => c.chat_template_kwargs.enable_thinking), [false, true, true]);
  assert.deepEqual(calls.map(c => c.chat_template_kwargs.reasoning_effort), [undefined, 'xhigh', 'xhigh']);
  assert.deepEqual(calls.map(c => c.tools?.length ?? 0), [0, 0, 1]);
  assert.deepEqual(agent.session.snapshotEvents().filter(e => e.type === 'request/header').map(e => e.data.header.config.reasoningEffort), ['off', 'xhigh', 'xhigh']);
  assert.equal(agent.options.reasoningEffort, 'xhigh');
  assert.equal(calls.length, 3, 'no classifier model calls');
  assert.equal(agent.session.snapshotEvents().filter(e => e.type === 'adaptive-reasoning/measurement').length, 3);
  assert.ok(calls[1].messages.some(m => ['system', 'developer'].includes(m.role) && m.content.includes('You are editing the supplied prompt')));
  const second = await ctx.agents.create({ sessionId: 'adaptive-parallel', meta: { agentPreset: 'linux' }, agentOptions: { provider: 'local', model: 'qwen', reasoningEffort: 'xhigh' } });
  const send = (a, text) => a.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
  send(second.agent, 'Rewrite: TRIGGER_GUARD');
  send(agent, 'Explain the architecture of a compiler.');
  await Promise.all([agent.whenIdle(), second.agent.whenIdle()]);
  assert.equal(executed, 0, 'text-only guard must prevent invented actions');
  const decisions = second.agent.session.snapshotEvents().filter(e => e.type === 'adaptive-reasoning/decision');
  assert.deepEqual(decisions.map(e => e.data.tier), ['off', 'high']);
  assert.deepEqual(decisions.map(e => e.data.textOnly), [true, false]);
  assert.equal(agent.session.requestHeader().config.reasoningEffort, 'xhigh', 'other agent retains independent depth');
  await pluginFiber.dispose();
  send(agent, 'Rewrite: Hello.');
  await agent.whenIdle();
  assert.equal(calls.at(-1).chat_template_kwargs.reasoning_effort, 'xhigh');
  assert.equal(calls.at(-1).tools.length, 1, 'uninstall restores the normal model selection and tools');
  assert.deepEqual(errors, []);
  await second.dispose();
  await handle.dispose();
  console.log('PASS: real DSH 0.1.5-rc.1 loop and pi-ai adapter, downstream model selection, sequential and concurrent turns, verified HTTP thinking parameters, durable timing records, tool-guard recovery and clean removal.');
} finally {
  await ctx.fiber.dispose();
  await new Promise(resolve => server.close(resolve));
  delete process.env.DSH_ADAPTIVE_TEST_KEY;
}

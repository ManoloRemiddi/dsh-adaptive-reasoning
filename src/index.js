// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
import { classify, atLeast, TIERS, editingGuidance } from './policy.js';

export const name = 'adaptive-reasoning';
export const inject = ['agents', 'tools'];

export function validateConfig(config = {}) {
  const { enabled = true, presets = [], routes = [], textOnly = true } = config;
  if (typeof enabled !== 'boolean' || typeof textOnly !== 'boolean' || !Array.isArray(presets) || presets.some(p => typeof p !== 'string' || !p))
    throw new Error('adaptive-reasoning: enabled must be boolean; presets must be nonempty strings');
  if (!Array.isArray(routes)) throw new Error('adaptive-reasoning: routes must be an array');
  const keys = new Set();
  for (const r of routes) {
    if (!r || typeof r.provider !== 'string' || !r.provider || typeof r.model !== 'string' || !r.model ||
        !TIERS.every(t => typeof r.efforts?.[t] === 'string' && r.efforts[t].length > 0))
      throw new Error('adaptive-reasoning: each exact route needs provider, model and four effort strings');
    const key = JSON.stringify([r.provider, r.model]);
    if (keys.has(key)) throw new Error('adaptive-reasoning: duplicate route');
    keys.add(key);
  }
  return structuredClone({ enabled, presets, routes, textOnly });
}

export function apply(ctx, rawConfig) {
  const config = validateConfig(rawConfig);
  if (!config.enabled) return;
  const states = new WeakMap();
  const claimed = new WeakMap();
  const textModes = new WeakMap();
  const measurements = new WeakMap();
  const scoped = agent => config.presets.includes(agent.session.header.agentPreset);
  const humanDecision = (messages, previousTier) => {
    const blocks = messages.filter(m => m.source?.kind === 'user').flatMap(m => m.content);
    return classify(blocks.filter(b => b.type === 'text').map(b => b.text).join('\n'), {
      hasMedia: blocks.some(b => b.type !== 'text'), previousTier,
    });
  };
  ctx.on('agent/inbox/claimed', ({ agent, message }) => {
    if (scoped(agent)) claimed.set(agent, [...(claimed.get(agent) ?? []), message]);
  });
  // Claimed input is available before assembly through DSH's public lifecycle
  // event. Consume the whole batch, not the most recently enqueued future turn.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const agent = context.agent;
    const batch = agent ? claimed.get(agent) : undefined;
    if (agent) { claimed.delete(agent); textModes.delete(agent); }
    const assembled = await next();
    if (!agent || !batch?.length || !scoped(agent) || !config.textOnly || context.signal?.aborted) return assembled;
    const provider = assembled.variables.provider ?? agent.options.provider;
    const model = assembled.variables.model ?? agent.options.model;
    if (!config.routes.some(r => r.provider === provider && r.model === model)) return assembled;
    const decision = humanDecision(batch, states.get(agent)?.tier);
    // Do not strip protocol transports or structured-output contributions.
    const protocol = assembled.tools.some(t => ['run_code', 'resonant_voice_reply'].includes(t.name)) ||
      assembled.sections.some(s => /ptc|structured|protocol/i.test(s.name));
    if (!decision.textOnly || protocol) return assembled;
    textModes.set(agent, { reason: decision.reason, removedTools: assembled.tools.length });
    return { ...assembled, tools: [], sections: [...assembled.sections, {
      name: 'adaptive-reasoning:bounded-editing', text: editingGuidance(decision.family),
    }] };
  }, { prepend: true });
  // Hiding schemas is not an execution boundary. Also block any invented tool
  // call on the text-only step; subsequent continuation restores tools/depth.
  ctx.tools.guard(exec => exec.agent && textModes.has(exec.agent)
    ? 'This request is a text-only transformation. Answer directly without tools.' : undefined);
  // Only the accepted human batch is classified. Tool outputs, memories and system
  // reminders cannot masquerade as a fresh simple user task.
  ctx.on('agent/pre-step', async ({ agent, turn, step, signal }, next) => {
    const admitted = await next();
    if (signal.aborted || admitted.kind !== 'enter' || !scoped(agent)) return admitted;
    const human = admitted.messages.filter(m => m.source?.kind === 'user');
    let state = states.get(agent);
    if (human.length) {
      state = { ...humanDecision(human, state?.tier), turn, step };
    } else if (!state || state.turn !== turn) {
      state = { tier: 'high', reason: 'resume-or-unclassified-input', turn, step };
    } else {
      // A second model step means the task required tools or other continuation.
      // Never keep a thinking-off decision across that boundary.
      state = { ...state, tier: atLeast(state.tier, 'medium'), reason: 'agent-continuation', step };
    }
    const recent = agent.session.snapshotEvents(Math.max(0, agent.session.seq - 64));
    const failed = recent.some(e => e.type === 'tool/result' && e.data.turn === turn &&
      (e.data.error !== undefined || e.data.message?.content?.some(b => b.type === 'tool-result' && b.isError)));
    if (failed) state = { ...state, tier: 'high', reason: 'tool-failure' };
    states.set(agent, state);
    return admitted;
  }, { prepend: true });

  // Wrap downstream model selection: provider/model and all other controls stay
  // exactly as selected. The DSH loop persists the returned effort in its header.
  ctx.on('agent/request', async ({ agent, turn, step, signal }, next) => {
    const proposed = await next();
    if (signal.aborted || !scoped(agent)) return proposed;
    const route = config.routes.find(r => r.provider === proposed.provider && r.model === proposed.model);
    if (!route) return proposed;
    const state = states.get(agent);
    if (!state || state.turn !== turn || state.step !== step) return proposed;
    const effort = route.efforts[state.tier];
    measurements.set(agent, { turn, step, tier: state.tier, started: performance.now(), firstTextMs: null,
      reasoningCharacters: 0, answerCharacters: 0, attempts: 0 });
    agent.session.append('adaptive-reasoning/decision', {
      version: 2, turn, step, tier: state.tier, effort, reason: state.reason, family: state.family ?? 'general',
      provider: proposed.provider, model: proposed.model,
      previousEffort: proposed.reasoningEffort ?? null,
      textOnly: textModes.has(agent), removedTools: textModes.get(agent)?.removedTools ?? 0,
    });
    return { ...proposed, reasoningEffort: effort };
  }, { prepend: true });

  // Passive measurement only: no timer, polling, benchmark loop or extra call.
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    const m = measurements.get(agent);
    if (!m) return;
    if (frame.type === 'start') { m.attempts++; return; }
    if (frame.type === 'chunk') {
      if (frame.chunk.type === 'text-delta') {
        if (frame.chunk.text) m.firstTextMs ??= Math.round(performance.now() - m.started);
        m.answerCharacters += frame.chunk.text.length;
      }
      if (frame.chunk.type === 'reasoning-delta') m.reasoningCharacters += frame.chunk.text.length;
      if (frame.chunk.type === 'finish') {
        const reason = typeof frame.chunk.reason === 'string' ? frame.chunk.reason : frame.chunk.reason?.kind;
        m.finish = ['stop', 'tool-calls', 'max-tokens', 'error', 'aborted'].includes(reason) ? reason : 'unknown';
      }
    }
    if (frame.type === 'end') {
      agent.session.append('adaptive-reasoning/measurement', {
        version: 1, turn: m.turn, step: m.step, tier: m.tier,
        durationMs: Math.round(performance.now() - m.started), firstTextMs: m.firstTextMs,
        reasoningCharacters: m.reasoningCharacters, answerCharacters: m.answerCharacters,
        attempts: m.attempts, finish: m.finish ?? 'unknown', outcome: frame.outcome.kind,
      });
      measurements.delete(agent);
    }
  });
}

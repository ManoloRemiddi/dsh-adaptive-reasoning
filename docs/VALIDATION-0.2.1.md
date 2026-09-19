<!-- Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT -->
# Greeting and route correction — 0.2.1

The September 19 investigation found no adaptive decision events in the latest
native voice session. Its selected route was `mx-qwen` with the 262k Qwen model;
the installed plugin allowed only the legacy `mx-5090-tray` dual route. Saved
`minimal` maps to low thinking on the current model, not thinking off. Independently,
0.2.0 classified standalone greetings as unknown/high, so enabling the route alone
would have increased their effort.

The observed turn began promptly but needed about 17 seconds to publish its reply.
The correlated Qwen request spent 7.832 seconds processing 23,647 input tokens and
8.351 seconds generating 278 output tokens. Another request shared inference
capacity. This fix addresses reasoning selection; it does not remove context
processing, model contention, ASR endpointing or structured-reply completion waits.

## Change

The bundle adds the exact verified current route and keeps its legacy route.
An anchored whole-request rule recognizes standalone English greetings, including
the observed speech-recognition variant. It does not match a greeting followed
by a real task. It changes only the request's reasoning effort. Tools remain
available for conversational greetings, and the presence of `resonant_voice_reply`
also protects voice transport from text-transformation tool removal. Complex
requests, explicit deep thinking, media and tool failures retain the prior depth
rules. This remains a conservative rule-based selector, not a semantic classifier
for every possible task. There is no extra classification model request.

## Verification

- 62 unit checks: positive and negative greeting boundaries, media, quoted input,
  real work after greetings, per-turn reset, tool guards and structured output.
- Real pinned DSH 0.1.5-rc.1 / Cordis 4.0.2 integration: existing lifecycle checks
  plus the shipped mx-qwen route and installed Resonant Voice reply contract.
  A deterministic HTTP receiver saw `enable_thinking=false` for a greeting and
  `true`/xhigh for the following diagnostic task; both preserved voice delivery.
- Isolated real Qwen test with the current route: effort off, zero reasoning
  characters, one successful structured voice reply, 789 ms from model request
  preparation to completion. This small-context probe is not full-preset or
  microphone-to-speaker latency. It creates no user chat, plays no audio, and
  stores no test turn in the user's memory journal.
- Offline artifact installation, composition and removal are tested in a disposable
  DSH home before replacing the live plugin.

Reproduce with `npm test`, `npm run test:integration`, `npm pack`, and
`npm run test:install`. Integration requires the pinned local DSH installation;
set `DSH_INSTALL_ROOT` if needed. The voice integration imports the installed
Resonant Voice contract. Opt into the single live model check with
`ADAPTIVE_LIVE_TEST=1 node test/greeting-integration.mjs` using that same environment.

## Deployment and rollback

Install the 0.2.1 source artifact into the existing web profile once DSH tasks and
native capture are idle. Preserve the package metadata, old 0.2.0 artifact and
installed plugin snapshot. The native draft and conversation survive the graceful
close/reopen used to release an idle voice connection before DSH restarts. No GPU,
model server, voice model, memory contents or saved thinking defaults are changed.
A session's adaptive decision/measurement events identify its actual per-request
choice; the saved picker selection is not that effective choice.

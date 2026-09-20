<!-- Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT -->

# Changes

## 0.2.3 — 20 September 2026

- Ship empty reasoning routes instead of developer-specific provider/model defaults.
- Preserve the 0.2.2 sidecar/cold-history fix and correct the setup instructions.
- Exercise explicit fixture routes without depending on the shipped allowlist.


## 0.2.1 — 2026-09-19

- Add the verified current mx-qwen 262k route alongside the legacy tray route.
- Disable thinking for complete, standalone English greetings. Additional work,
  explicit deep reasoning, media and ambiguous follow-ups retain existing rules.
- Preserve the structured Resonant Voice tool, including for text transformations.
- Add exact-route DSH/HTTP and real-model greeting verification; log decisions and
  zero reasoning characters without persisting test prompts into user sessions.

## 0.2.0 — 2026-09-13

- Separate supplied text from instructions without discarding instructions after
  a closing quote or code fence. Keep unclosed delimiters and context-dependent
  requests at high reasoning.
- Require supplied source material for the text-only fast path. Keep code,
  configuration, mathematical proof and consequential operations out of it.
- Add automatic low/medium routing for supplied-text summaries.
- Keep prompt improvement at high reasoning after lower-effort quality failures.
  Add bounded editing guidance to discourage scope expansion; this is not a
  semantic correctness guarantee.
- Record per-request first-answer timing and character counts without copying
  generated text. Provide an on-demand report; no background inference or polling.
- Expand unit and real-harness tests, including concurrent sessions, attempted
  tool misuse, restoration after tool failure, metrics and removal.
- Verify local tarball installation, profile composition and removal in a
  disposable profile. Add a finite live DSH/model validation suite.

## 0.1.0 — 2026-09-13

Experimental automatic effort routing and text-only handling. Real model
comparisons found strong latency improvement for rewriting, but prompt editing
at low reasoning did not pass the no-new-requirements quality gate.


## 0.2.2 — 20 September 2026

- Fix cold-restart failures by removing custom diagnostic writes from DSH session
  logs. Keep diagnostics in a private, bounded sidecar; retain normal request headers.
- Add real compressed persistence and a separate-process reopening check with the
  plugin absent, alongside the existing deterministic agent/voice integration tests.
- Keep diagnostic storage failures from breaking turns. Update report and install proof.

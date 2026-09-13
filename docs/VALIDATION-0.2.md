<!-- Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT -->

# Version 0.2 validation

Date: 2026-09-13. No GPU power settings, model defaults or background tasks changed.

## Policy decisions

Clear supplied-text transformations use off, short supplied-text summaries use
low, ordinary analysis uses medium, and difficult/unknown/context-dependent work
uses high. Explicit deep reasoning is respected. Source quotations are not task
instructions, and commands after a closed source quotation remain instructions.

Prompt improvement stays **high**. Additional historical experiments found:

| Candidate on the original prompt-improvement request | Completion | Quality finding |
| --- | ---: | --- |
| Medium, text-only, bounded editing guidance | 28.49 s | Still promoted beliefs to constraints and added prioritisation |
| Off, text-only, stricter guidance | 4.60 s | Still added focus areas and a structured-list requirement |

Neither candidate was promoted. The purpose of the quality gate is to avoid
declaring a quick but less faithful response a solution. High also cannot
guarantee faithfulness; it simply avoids an unvalidated reasoning downgrade.
Text-only prompt improvement still removes irrelevant tool schemas.

## Engineering checks

- **48 passing tests:** routing, missing source context, quoted/code payloads,
  instructions after source delimiters, mixed requests, critical operations,
  malformed boundaries, tool escalation, cancellation, allowed scopes,
  configuration validation, tool guard and passive measurement privacy.
- **Actual DSH 0.1.5-rc.1 + pi-ai integration:** sequential and concurrent agent
  requests reached a deterministic HTTP endpoint with the expected reasoning
  parameters. Model-selection middleware did not override the router. Effective
  settings and measurements were recorded. An invented tool call in a text-only
  step did not execute, and the following step restored tools and high reasoning.
  Disposing the plugin restored the original selection and tools.
- **Disposable installation:** `dsh plugin add` installed the local tarball without
  scripts or dependency downloads; the bundle was mounted once, the profile
  composed, and removal removed the bundle. No user profile was involved in this
  proof. The eventual live installation is recorded separately in local outputs.

## Finite live suite

Five synthetic cases ran through the actual installed DSH loop, this plugin and
pi-ai to the already-running loopback Qwen endpoint. Each had a new in-memory
session, no actual tools, a 4,096-token cap and temperature 0.2. No persistent user
chat was created. The checks inspect stated facts, key strings, grammatical
correction, uncertainty, no tool calls and normal completion. Outputs were also
read manually. This is a small smoke suite, not a broad language-quality benchmark.

| Case | Selected effort | Completion | Result |
| --- | --- | ---: | --- |
| Rewrite preserving name, amount, date, quantities and uncertainty | Off | 0.294 s | Passed |
| English to Italian, preserving names and quantities | Off | 0.213 s | Passed |
| Grammar-only proofreading | Off | 0.175 s | Passed |
| One-sentence summary retaining time and destination | Low | 0.529 s | Passed |
| Rewrite quoted deletion instructions without executing them | Off | 0.157 s | Passed |
| Matched rewrite with plugin removed | xhigh | 1.681 s | Passed; same answer |

The suite first flagged the quoted-command answer because its check was
case-sensitive (`Check` rather than `check`). The answer was correct; the check
was fixed, and the finite suite was rerun successfully. This correction did not
change model behaviour or the plugin policy.

These short samples have much smaller context than the earlier real sessions.
The baseline was run after the automatic samples, not randomised; cache and
server load are not controlled. Do not extrapolate these timings to arbitrary
tasks or claim measured electricity savings. No watt-hours were measured.

## Operational boundaries

- Rule-based English task recognition; unknown languages/tasks keep high effort.
- No semantic judge model, training, classifier inference, automatic quality
  reruns, hard reasoning-token budget or native Auto badge.
- Existing picker shows saved selection; actual effort is in the request log.
- Initial coverage is the exact Augmentor Linux preset and existing Qwen route.
- New bundle installation requires a later DSH start. Installation does not
  interrupt active tasks or restart the service.
- Passive measurements are observations of real requests, not controlled
  performance claims. The reporting command runs only when invoked.

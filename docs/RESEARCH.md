<!-- Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT -->

# Automatic reasoning allocation: initial 0.1 research and evidence

Historical 0.1 prototype findings. The current 0.2 release policy and evidence are in [VALIDATION-0.2.md](VALIDATION-0.2.md).

Date: 2026-09-13. Target: Augmentor Linux using DSH 0.1.5-rc.1 and its installed
Qwen3.8 27B GSQ MTP model on the RTX 5090.

## Conclusion

Per-request reasoning selection is technically feasible through a supported DSH
plugin. It can reduce unnecessary generation without keeping a GPU active between
requests. Reliable difficulty estimation across arbitrary tasks is a separate
problem: no evidence here establishes that a small ruleset can do that perfectly.
The delivered version is an experimental, conservative router with a verified
fast path for bounded writing, not a general quality-preserving optimiser.

## Primary sources

- [DeepSeek Harness extension cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md):
  documents lifecycle/request waterfalls and native Cordis plugin extensions.
  Exact hook shapes were checked against installed 0.1.5-rc.1 declarations and code,
  rather than assuming the current master API matches the installation.
- [RADAR, ICLR 2026](https://proceedings.iclr.cc/paper_files/paper/2026/hash/b1f7288854d3bd476c17725c2d85967f-Abstract-Conference.html):
  routes model configurations using learned query difficulty and model-budget
  capability estimates. It supports the general allocation idea; its training
  and evaluations are not transferable performance guarantees for this plugin.
- [AdaptThink, EMNLP 2025](https://aclanthology.org/2025.emnlp-main.184/):
  trains models to select thinking versus non-thinking. This requires model
  adaptation and is not functionality obtained just by installing a DSH hook.
- [llama.cpp server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md):
  describes thinking/template controls and reasoning budgets. The local server's
  actual `/props` template was inspected and accepts off, low, medium and xhigh.
  Low/medium are model instructions, not guaranteed wall-time or token caps.

## Options assessed

1. **A separate model judges every prompt.** Semantically flexible, but adds
   classification latency and inference energy; a second model may need loading.
   It is unnecessary overhead for obvious rewrites. Not used.
2. **A trained lightweight router.** Potentially the strongest eventual option.
   Requires labelled examples from this user's workload and model, including
   quality at different budgets. A research paper's benchmark does not supply
   that local calibration. Not implemented or claimed.
3. **Ask the same model to decide how much to think.** The model already has some
   latitude, but the original traces show that xhigh leads to excessive reasoning.
   A generic prompt to be brief is weaker than the model's explicit controls.
4. **Conservative CPU rules plus per-step escalation.** Near-zero routing overhead,
   no extra model, preserves high effort for uncertain requests. Selected for
   this prototype. It recognises task families rather than scoring every possible
   question's intrinsic difficulty.
5. **GPU warm-up, higher clocks, permanent dummy inference.** Unnecessary for the
   observed bottleneck and contrary to the user's constraint. Not implemented.

## Original evidence

| Task | Completion wait | Input evaluation | Generation | Internal reasoning words | Answer words |
| --- | ---: | ---: | ---: | ---: | ---: |
| Prompt improvement, 13:40 local | 54.8 s | 3.15 s | 51.42 s | 3,653 | 722 |
| Paragraph rewrite, 13:42 local | 25.7 s | 3.03 s | 22.48 s | 2,171 | 96 |

Both used xhigh, around 10,000 prompt tokens and 45 tool schemas. Neither used
tools. Both launched an auxiliary title request. No model-load delay appears in
these requests. Original main-call generation was about 116–125 tokens/s.

## Live evaluation and a failed approach

First, thinking off with the original tools caused the model to propose a bash
placeholder (`echo`), not return the requested rewrite. The comparison utility
executed no tool. Two exploratory streams were stopped at a tool-call frame;
a subsequent complete capture confirmed the placeholder. This is why this
version also removes tools for recognised bounded writing steps and installs a
guard against invented calls. Simple effort switching alone was insufficient.

Low reasoning with the original tools completed prompt improvement in 62.8 s,
with 1,353 reasoning words and 2,761 output tokens. It was slower than the historic
baseline despite generating fewer tokens, showing why historical wall-time
comparisons cannot establish a clean causal speedup.

Then the utility replayed the original user/system text with the selected effort
and no tool schemas, matching the plugin's text-only policy:

| Task | Effort | First answer text | Completion | Reasoning words | Output tokens |
| --- | --- | ---: | ---: | ---: | ---: |
| Paragraph rewrite | Off | 0.42 s | 2.63 s | 0 | 97 |
| Prompt improvement | Low | 22.54 s | 39.98 s | 788 | 2,151 |

Input shrank to 1,102 / 1,332 tokens. Both completed with `stop` and no tool calls.
The rewrite preserved the central meaning, returned only rewritten text, and
avoided em dashes. **The low-effort prompt-improvement answer is not a quality
pass:** it assumed a frontier-class model and introduced constraints and item
counts despite the user's request not to invent requirements. The original
xhigh answer also introduced requirements; this is not evidence that low alone
caused the failure. It is evidence that latency success is not enough to approve
that task family for unattended production use.

These are single direct HTTP replays, not native-UI end-to-end benchmarks.
The unchanged source instructions and tool schemas were reconstructed from logs;
the utility used an 8,192-token safety cap rather than 65,536. Neither completed
sample hit the cap. It omitted the auxiliary title call. Concurrent requests were
visible in the server log, and generation during the successful replays was about
44 and 54 tokens/s, below the historical rates. Cache/load conditions and sampling
were not matched. Do not market the observed differences as guaranteed speedups.

## What is verified and what remains

- Routing and isolation tests cover fresh turns, followups, failed tools, mixed
  requests, non-user content, quoted payloads, unsupported scopes, cancellation,
  configuration errors, text-only guards and protocol preservation.
- The installed DSH loop and pi-ai adapter completed three deterministic turns,
  delivering `enable_thinking=false`, then low, then xhigh to an HTTP receiver.
  Tools were absent on the first two requests and restored on the third.
  Actual effort was durably logged; saved selection stayed xhigh. No classifier
  inference was added. This is integration evidence, not a model quality test.
- No trained router, UI Auto badge, title optimisation or hard reasoning-token
  budget is implemented. Provider defaults and GPU power settings are untouched.
- No electricity measurement was made. Fewer generated tokens suggest less work
  per task, but watt-hours must be measured before claiming bill savings.
- Before enabling broadly: evaluate matched off/low/medium/high runs across a
  representative workload, score correctness and instruction following, include
  ambiguous/multilingual/long-context tasks, and measure idle/cold and busy-server
  conditions separately. Promote only task families that pass the quality gate.

The plugin is delivered as a local experimental package and is **not activated**
in the live profile, because the quality gate above has not passed for prompt
improvement. This avoids presenting a prototype as a complete automatic optimiser.

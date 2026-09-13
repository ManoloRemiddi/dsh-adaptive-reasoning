<!-- Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT -->

# DSH Adaptive Reasoning 0.2.0

Our standalone DeepSeek Harness plugin chooses reasoning automatically for each
request. It uses the existing model. No per-prompt switches, classifier model,
background inference, GPU warm-up, power-setting changes or recurring jobs.

This is a conservative first usable preview, tested with DSH **0.1.5-rc.1**, Cordis
**4.0.2**, and the existing Qwen3.8 27B GSQ model. It recognises task families with
local rules; it is not a trained or infallible difficulty estimator.

## What happens automatically

| Task | Reasoning | Tools |
| --- | --- | --- |
| Clear rewrite, translation or proofreading with supplied text | Off | Hidden and blocked for that step |
| Short summary of supplied text | Low | Hidden and blocked for that step |
| Longer supplied-text summary | Medium | Hidden and blocked for that step |
| Ordinary explanation or comparison | Medium | Available |
| Prompt improvement | High | Text-only when the source prompt is supplied |
| Complex, consequential, ambiguous or unrecognised work | High | Available |
| Continuation after tools | At least medium | Restored |
| Tool failure in the current turn | High | Available |

Prompt improvement deliberately retains high reasoning: faster modes invented
requirements in evaluation. We did not promote that task family on latency alone.
Clear text work gets a short instruction to preserve facts, uncertainty and scope.
The plugin does not guarantee semantic correctness or validate every final answer.

The current bundle covers only `augmentor-linux-product` and
`mx-5090-tray/Qwen3.8-27B-GSQ-RCO-IQ3_S-mtp-262k-dual`. Other tasks and models pass
through. Provider, model, sampling and output allowances are preserved.

## Installation

[Download the 0.2.0 preview](https://github.com/ManoloRemiddi/dsh-adaptive-reasoning/releases/tag/v0.2.0)
or install its ready-made package:

```sh
dsh plugin --profile web add https://github.com/ManoloRemiddi/dsh-adaptive-reasoning/releases/download/v0.2.0/dsh-adaptive-reasoning-0.2.0.tgz --ignore-scripts --config.auto-install-peers=false
```

**Configuration is required on other installations.** The shipped allowlist is
specific to the tested Augmentor preset and Qwen route. It does nothing for other
presets/models until configured. See [setup for your own model](docs/SETUP.md).
This is a preview, not a universal automatic difficulty estimator.

To package a source checkout instead:

```sh
npm pack
dsh plugin --profile web add /absolute/path/dsh-adaptive-reasoning-0.2.0.tgz --offline --ignore-scripts --config.auto-install-peers=false
```

The tarball needs no runtime dependency downloads: it consumes services from the
installed DSH host. CLI installation adds its bundle once. New bundle manifests
are picked up on the next DSH start; installing the package does not restart DSH.
Finish running tasks before restarting. No per-prompt adjustment is needed after
activation. The local deployment record is under ignored `outputs/install-state.json`.

To remove:

```sh
dsh plugin --profile web remove dsh-adaptive-reasoning --config.ignore-scripts=true --config.auto-install-peers=false
```

Or set `enabled: false` for the plugin row and reload. Removing/disabling the
plugin restores normal reasoning selection and tools. It never rewrites the saved
provider default. The native picker still displays the saved selection, not an
Auto badge; `request/header` records the actual effort used.

## Evidence without background work

Every participating model request records a reason in
`adaptive-reasoning/decision`, then timing and character counts in
`adaptive-reasoning/measurement`. These events copy no prompt or answer text.
They measure time from request preparation, not from clicking Send, and do not
measure electricity. Cancelled requests may lack a completed measurement.

To read a summary from existing logs:

```sh
npm run report
```

The report inspects the 100 most recently modified session files, performs no
inference and runs only when requested. Task mix and server load affect the results.

## Configuration

- `enabled`: boolean, default true.
- `textOnly`: boolean, default true.
- `presets`: exact preset allowlist; empty means inactive.
- `routes`: exact provider/model pairs with an `efforts` mapping for `off`, `low`,
  `medium`, `high`. The existing Qwen maps high to `xhigh`.

Automatic mode owns per-request effort on allowlisted routes. Explicit requests
to think deeply remain high. Unsupported effort strings fail DSH's adapter
validation before inference. Unrecognised languages retain high reasoning.

## Engineering and validation

Uses supported DSH lifecycle/request hooks, an assembly transform and a tool
guard. Tools are restored on the next step; invented actions in a text-only step
are blocked, then the normal loop can recover with more reasoning. Known PTC and
structured-output contributions opt out of tool filtering. No automatic replay
of completed actions or permission relaxation is introduced.

```sh
npm test
npm run test:integration
npm pack
node test/install-proof.mjs
```

The integration test uses the installed DSH loop and pi-ai adapter against a
local deterministic HTTP endpoint. It tests sequential and concurrent sessions,
wire-level effort, tool blocking/recovery, telemetry, and clean removal. It creates
no persistent user chats. Set `DSH_INSTALL_ROOT` if DSH is installed elsewhere.
The install proof uses and removes a disposable DSH home.

An explicitly opted-in, finite live suite is available with
`ADAPTIVE_LIVE_TEST=1 npm run test:live`. It sends five synthetic writing tasks and
one matched baseline to the already-running loopback model through the real DSH
loop, with no actual tools registered. Private historical experiments and live
outputs are excluded from the distributable package.

See [0.2 validation](docs/VALIDATION-0.2.md),
[initial research](docs/RESEARCH.md), and [changes](CHANGELOG.md).

## Support and related plugins

[Report issues](https://github.com/ManoloRemiddi/dsh-adaptive-reasoning/issues)
with your DSH version, model and a synthetic example. Do not include credentials
or private session logs. Browse the
[DeepSeek Harness Plugins collection](https://github.com/ManoloRemiddi/deepseek-harness-plugins).

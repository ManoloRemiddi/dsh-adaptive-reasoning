<!-- Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT -->

# 0.2.2 restart correction — 20 September 2026

The prior integration test ran live DSH agents in memory. It did not close and
reopen stored histories. The installed DSH 0.1.5-rc.1 persistence reader rejects
unknown required event types, while its public `Session.append()` does not copy
an `ignorable` option into the event envelope. Consequently, diagnostic events
worked until a cold read, then blocked reopening the conversation.

The plugin now stores diagnostic records outside conversation storage. This also
allows histories to reopen with the plugin removed. No upstream harness file was
patched and no required-event validation was weakened. Actual reasoning effort
continues to appear in DSH's standard `request/header` events.

## Evidence

- 63 policy/plugin tests passed, including an unwritable diagnostic store.
- Real DSH loop + deterministic HTTP provider integration passed, including
  model selection, text-only guards, concurrency, uninstall and structured voice.
- Two actual compressed histories were persisted and closed, then reopened in
  another Node process without the plugin installed in that context. Both kept
  assistant messages, normal request headers and completed turns; neither had
  custom diagnostic events.
- 0.2.2 tarball install/composition/removal passed in a disposable DSH home.
- Six affected installed histories contained 216 legacy diagnostic records.
  Augmentor's recovery repair acquired each session's kernel lease, verified a
  backup and added `ignorable: true` only to the two known informational types.
  All original records, sequence numbers and contents were independently compared
  before/after. Backups remain private on the installation.

Existing malformed histories are not repaired by package installation itself.
Use Augmentor's recovery implementation and its [incident guide](https://github.com/ManoloRemiddi/augmentor-agent/blob/main/docs/RESTART-RELIABILITY-2026-09-20.md).
Do not delete custom events or disable DSH's validation globally.

The installed desktop/backend restart drills are documented in that incident
guide. A hardware power cycle and human microphone/speaker acceptance are distinct
from deterministic persistence and transport tests.

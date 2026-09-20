<!-- Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT -->

# Set up automatic reasoning for your own model

Version 0.2.3 is a preview verified with DSH 0.1.5-rc.1, Cordis 4.0.2 and
Qwen3.8 27B GSQ. Install Node.js 22.18.0 or newer and a working DSH web
profile first. Configure and test your model in DSH before adding this plugin.
The plugin does not download, serve or keep a model loaded.

## One-time configuration

The supplied package has an empty route list and does not alter model effort until you configure a verified route. It contains no machine-specific provider/model defaults.
For your own setup, create a configured package from the release source:

```sh
git clone --branch main --depth 1 https://github.com/ManoloRemiddi/dsh-adaptive-reasoning.git
cd dsh-adaptive-reasoning
```

Edit `cordis.patch.yml`. Under the existing `config` entry, replace `presets`,
`provider` and `model` with the exact identifiers used by your DSH installation.
Display names may differ from identifiers. Keep the existing plugin name and ID.
The following is a template, not a model configuration that works unchanged:

```yaml
        presets: [your-preset-id]
        routes:
          - provider: your-provider-id
            model: your-model-id
            efforts:
              off: 'off'
              low: low
              medium: medium
              high: xhigh
```

The four values under `efforts` must be supported by your DSH adapter and model.
`xhigh` is the tested Qwen mapping; do not assume other models support it or
that they implement thinking-off in the same way. Do not enable a route if you
cannot establish those controls. This release does not discover capabilities.

```sh
npm test
npm pack
dsh plugin --profile web add "$PWD/dsh-adaptive-reasoning-0.2.3.tgz" --ignore-scripts --config.auto-install-peers=false
```

No npm install is needed for the dependency-free unit suite or packaging.
Use your actual profile name if different from `web`. Finish running tasks,
restart the existing DSH process, then reload its web page. Keep just one
installation and one bundle registration. Preserve your configured source for
future upgrades; keep your route configuration in your private DSH profile instead of relying on package defaults.

This is one-time setup. Each subsequent prompt is routed automatically; the
saved model picker can continue to show its original effort setting.

## Check that it works

Try a small synthetic request such as `Rewrite this politely: "Send the file."`.
The private diagnostics sidecar records the decision and measurement. Inspect
`request/header` in the session for the actual effort. Diagnostic events are
never appended to the conversation replay log (fixed in 0.2.2). `npm run report` summarizes existing logs without inference;
it requires the `zstd` utility to read compressed session logs.

If there are no decision records, check the preset/provider/model IDs and restart
activation. An unknown task should retain high reasoning. A faster answer alone
does not establish correctness: check that facts, uncertainty and requirements
are preserved. Only the documented Qwen setup has live model evidence.

## Remove or disable

Set `enabled: false` under the package's `config`, repack and reinstall, or remove:

```sh
dsh plugin --profile web remove dsh-adaptive-reasoning --config.ignore-scripts=true --config.auto-install-peers=false
```

Restart DSH after removal. The plugin does not change your saved model selection
or GPU settings. Its rules use CPU string processing, with no classifier call,
keep-alive request or recurring job.


### Upgrade from 0.2.1

Install 0.2.2 and reload DSH only when its sessions and voice are idle. Existing
legacy diagnostic records require a backed-up history repair; see
[0.2.2 validation](VALIDATION-0.2.2.md). New decision and measurement records are
in the private sidecar, not in participating conversation logs.

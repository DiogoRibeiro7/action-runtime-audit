# Action Runtime Audit

Identify actions that declare retired Node runtimes in GitHub Actions
workflows. The audit follows direct actions, nested composite actions, and
reusable workflow calls. It reads `action.yml` or `action.yaml` at the ref used
by each workflow, then reports the reference chain behind each finding.

The action reads metadata; it does not execute the actions it inspects.

## Usage

Use a published release tag, or pin the full commit SHA for an immutable
reference:

```yaml
name: Action runtime audit
on: [pull_request]
permissions:
  contents: read
jobs:
  audit:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: DiogoRibeiro7/action-runtime-audit@v0.1.2
        with:
          github-token: ${{ github.token }}
```

The calling workflow needs `contents: read`. The action uses that token to
inspect public action repositories and the checked-out workspace for local
actions. For private dependencies, supply a token with Contents read access to
each dependency repository. The caller repository must be checked out first.

## Inputs and outputs

| Name | Direction | Description |
| --- | --- | --- |
| `github-token` | Input, required | Token with Contents read access to referenced repositories. |
| `blocked-runtimes` | Input | Comma-separated `runs.using` values; default `node12,node16,node20`. |
| `findings` | Output | JSON array of `{ workflow, chain, action, runtime }` objects. |
| `checked-actions` | Output | Number of action references inspected. |

The check exits unsuccessfully if it finds a blocked runtime or cannot inspect
a reference. It also writes a table and any scan errors to the job summary.
For example, a finding might have `chain` equal to
`[".github/workflows/ci.yml", "owner/wrapper@v2", "owner/legacy@v1"]`.

Set `blocked-runtimes` explicitly when your policy changes:

```yaml
with:
  github-token: ${{ github.token }}
  blocked-runtimes: node12,node16,node20
```

## Scope and limitations

The audit scans YAML files directly inside `.github/workflows/`. It follows
`uses:` in jobs and steps, including reusable workflows and composite actions.
It recognizes local step references (`./` from the checkout and `$/` from a
composite action's repository) and reads remote references at their specified
tag or commit. It does not audit actions invoked by shell scripts.

Unresolvable or inaccessible references fail explicitly. `docker://` references
are skipped because they do not declare a Node runtime. A tag can move after
the audit; use immutable commit SHAs for reproducible results. The audit checks
source metadata, which may differ from the runtime actually chosen by a runner
during a migration.

The default policy is a convenience, not a live registry of GitHub runner
runtimes. Review it as GitHub's runtime support changes.

## Development

Requires Node.js 24. Run `npm ci` followed by `npm run check`. The committed
`dist/index.cjs` is built from `src/` and checked by CI. See
[CONTRIBUTING.md](CONTRIBUTING.md), [the release procedure](docs/releasing.md),
[SECURITY.md](SECURITY.md), and [LICENSE](LICENSE).

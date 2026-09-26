# Action Runtime Audit

Report retired Node runtimes in the actions used by your GitHub Actions workflows.
The audit follows direct actions, nested composite actions, and reusable workflow
calls. It inspects the metadata at each referenced tag or commit; it does not
execute third-party action code.

## Usage

Once this repository is accessible to the calling repository, reference a
reviewed commit (or a published release tag):

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
      - uses: DiogoRibeiro7/action-runtime-audit@<commit-sha>
        with:
          github-token: ${{ github.token }}
```

The check fails if an action declares `node12`, `node16`, or `node20`, or if it
cannot inspect referenced metadata. Configure `blocked-runtimes` with a
comma-separated list as GitHub's supported runtimes change. Results appear in
the job summary and in the `findings` JSON output.

For private action dependencies, provide a token with Contents read access to
those repositories. The caller repository must be checked out first. Dynamic
`uses:` expressions and inaccessible dependencies fail explicitly. Docker
references are ignored because they do not declare a Node runtime.

This is a source-metadata check. It does not determine which runtime a runner
actually substituted during a migration, or audit dynamically invoked actions.

## Development

Requires Node.js 24. Run `npm ci` followed by `npm run check`. The committed
`dist/index.js` is built from `src/` and checked by CI. See [LICENSE](LICENSE).

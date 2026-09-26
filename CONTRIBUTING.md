# Contributing

This action audits metadata without executing referenced actions. Please keep
changes to the parser and API reader narrowly scoped and include a fixture for
each behavior change.

## Local checks

Install Node.js 24 and run:

```sh
npm ci
npm run check
```

`npm run check` typechecks, runs tests, rebuilds the committed JavaScript bundle,
and verifies that the bundle has no uncommitted changes. When changing `src/`
or runtime dependencies, run `npm run build` and include `dist/index.cjs` in
the pull request. Do not include tokens or private repository content in tests.

Open a pull request against `main` with a short description and the validation
performed. Treat changes to the action's inputs, outputs, default blocked
runtimes, or failure behavior as compatibility changes and update the README.
Dependency updates, including Dependabot pull requests, require review; major
upgrades are handled separately.

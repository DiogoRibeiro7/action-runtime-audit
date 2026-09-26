# Changelog

Changes to the action's public behavior are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

## 0.1.0 - 2026-09-26

- Inspect direct actions, nested composite actions, and reusable workflows at
  the referenced tag or commit.
- Report blocked Node runtimes in the job summary and a JSON output, and fail
  when referenced metadata cannot be inspected.
- Include a Node 24 executable bundle and public CI smoke test.

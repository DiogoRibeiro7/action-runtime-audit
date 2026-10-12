# Changelog

Changes to the action's public behavior are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

- Expose scan errors as a JSON output so downstream workflows can distinguish
  unreadable references from blocked runtimes.

## 0.1.2 - 2026-09-26

- Continue auditing independent references after an unreadable action or
  reusable workflow, while retaining the per-workflow traversal limit.

## 0.1.1 - 2026-09-26

- Reset the reference traversal limit for each workflow so repositories with
  many independent workflows can be audited.

## 0.1.0 - 2026-09-26

- Inspect direct actions, nested composite actions, and reusable workflows at
  the referenced tag or commit.
- Report blocked Node runtimes in the job summary and a JSON output, and fail
  when referenced metadata cannot be inspected.
- Include a Node 24 executable bundle and public CI smoke test.

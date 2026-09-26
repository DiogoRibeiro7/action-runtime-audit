# Releasing

The action runs from committed `dist/index.cjs`. This repository is an action,
not an npm package; `package.json` is marked private intentionally.

1. Review the changes since the last tag. Choose a SemVer version. Changes to
   inputs, outputs, default policy, or failure behavior may require a major
   version.
2. Update `package.json`, `package-lock.json`, and `CHANGELOG.md` in a pull
   request. Run `npm ci && npm run check`, and review the generated bundle.
3. Merge after review and validation. Create an annotated version tag on the
   validated `main` commit, for example `git tag -a v1.0.0 -m "v1.0.0"` and
   `git push origin v1.0.0`. Wait for the tag workflow to complete.
4. Create a GitHub release from that exact tag with notes from `CHANGELOG.md`.
   Once the repository is public, the release can be listed on GitHub
   Marketplace. Test the released tag in a separate consumer repository.

Do not move published version tags. Consumers seeking a fixed dependency can
pin the full commit SHA shown on the release. Review and merge dependency
updates before preparing a release; Dependabot does not rebuild `dist/` for you.

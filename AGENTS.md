# AGENTS.md

For AI agents working in this repository. `jappend` is an npm library that appends entries to a JSON array file without loading the whole file into memory. Its API and usage: [README.md](README.md).

## Commands

Everything runs through mise: it installs the pinned Node and Bun. `mise tasks` lists the tasks.

| Command             | Does                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `mise run setup`    | installs every dependency; run it in every new checkout                                                             |
| `mise run check`    | lint (oxlint, oxfmt and `tsc`), build, every test level and the packed package in plain Node; green before a commit |
| `mise run check:ci` | `check` with coverage and its 80% floor, and the SonarQube reports; CI runs it                                      |

## Rules

- Name a unit test `*.unit.test.ts` and put it beside the code it covers. Fakes such as `InMemoryFileHandle` and `FakeReadableStream` live in `tests/`. The integration test is `tests/jappend.integ.test.ts`.
- `tests/InMemoryFileHandle.ts` ships in the package as `dist/tests/InMemoryFileHandle.js` for users to test their own code. Keep its import path stable.
- Write each relative import with its `.js` file name, as Node needs for an ES module. `tsc` refuses one without it, and `mise run test:package` imports the packed package in plain Node.
- Record every user-facing change under `## [Unreleased]` in `CHANGELOG.md`. The release PR moves them under its version header.

## Release

Release only when the owner asks. A PR raises `version` in `package.json` and moves the `## [Unreleased]` entries under `## X.Y.Z - YYYY-MM-DD`. Once it merges, the Release workflow (`.github/workflows/release.yml`) checks, packs and publishes the package to npm through the shared [Release npm](https://github.com/kk-forge-engineering/gh-actions/blob/main/.github/workflows/release-npm.yml) workflow. The `production` environment's reviewer approves the publish, and the workflow then tags `vX.Y.Z` with a GitHub Release. npm trusts `release.yml` as the package's Trusted Publisher, so the workflow uses no npm token.

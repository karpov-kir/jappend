# AGENTS.md

For AI agents working in this repository. `jappend` is an npm library that appends entries to a JSON array file without
loading the whole file into memory. Its API and usage: [README.md](README.md).

## Commands

Everything runs through mise: it installs the pinned Node and Bun. `mise tasks` lists the tasks.

| Command | Does |
| --- | --- |
| `mise run setup` | installs every dependency; run it in every new checkout |
| `mise run check` | lint (ESLint and `tsc`), build and every test level; green before a commit |
| `mise run check:ci` | `check` with coverage and its 80% floor, and the SonarQube reports; CI runs it |

## Rules

- Name a unit test `*.unit.test.ts` and put it beside the code it covers. Fakes such as `InMemoryFileHandle` and
  `FakeReadableStream` live in `tests/`. The integration test is `tests/jappend.integ.test.ts`.
- `tests/InMemoryFileHandle.ts` ships in the package as `dist/tests/InMemoryFileHandle.js` for users to test their own
  code. Keep its import path stable.
- Record every user-facing change under `## [Unreleased]` in `CHANGELOG.md`. Leave the version header to the release.

## Release

Release only when the owner asks. The Release workflow (`.github/workflows/release.yml`) runs from the Actions tab on
a version the owner gives. It builds the package, publishes it to npm and pushes the version commit and tag.
[release/README.md](release/README.md) has the steps for a stable and a beta release.

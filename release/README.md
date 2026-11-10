# Release

The Release workflow (`.github/workflows/release.yml`) runs `release/release.sh` from the Actions tab. It needs the `NPM_PUBLISH_TOKEN` secret. Tick "Dry run" to commit and tag in the runner without publishing or pushing.

## Production

- Merge the changes to `main`
- Check that `CHANGELOG.md` lists them under `## [Unreleased]`
- Run the Release workflow with the version, e.g. `1.0.0`

## Beta

- Merge the changes to `main`
- Run the Release workflow with the version, e.g. `1.0.0-beta.1`, and tick "Skip CHANGELOG update"

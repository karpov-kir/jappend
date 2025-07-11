# Release

## Requirements
- Make Sure `GITHUB_TOKEN` has write access
  - Go to Settings > Actions > General > Workflow permissions
  - Check "Read and write permissions"

## Production
- Merge a PR to the `main` branch
- Ensure there are some unreleased changes in the `CHANGELOG.md`
- Run the Release GH action
  - Input the version number (e.g. `1.0.0`)

## Beta
- Merge a PR to the `main` branch
- Run the Release GH action
  - Input the version number (e.g. `1.0.0-beta.1`)
  - Tick "Skip CHANGELOG update"

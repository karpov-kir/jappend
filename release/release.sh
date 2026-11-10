#!/bin/bash

# Commits and tags VERSION, publishes the package to npm and pushes the commit and tag. The Release
# workflow runs it with `npm run release` from the package root on a clean `main`.
#
# Environment:
#   NPM_PUBLISH_TOKEN      required, the npm token that publishes the package
#   VERSION                required, the version to release
#   DRY_RUN                `true` commits and tags locally but publishes and pushes nothing
#   SKIP_CHANGELOG_UPDATE  `true` leaves CHANGELOG.md alone

set -e

echo "Releasing the package to the NPM registry"

if [ -z "$NPM_PUBLISH_TOKEN" ]; then
  echo "NPM_PUBLISH_TOKEN is missing"
  exit 1
fi

if [ -z "$VERSION" ]; then
  echo "VERSION is missing"
  exit 1
fi

if ! [ -f ./package.json ]; then
  echo "Cannot find package.json file. Execute the command from the root of the package."
  exit 1
fi

if [ "$(git status -s)" ]; then
  echo "Uncommited changes detected. Please commit your changes before publishing the package."
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  echo "!!!! DRY RUN MODE !!!!"
fi

if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "You must be on the main branch to publish to the NPM registry."
  exit 1
fi

echo "Verifying NPM credentials"

npm config set registry https://registry.npmjs.org

export NPM_CONFIG_USERCONFIG="$PWD/release/.npmrc"
echo "//registry.npmjs.org/:_authToken=${NPM_PUBLISH_TOKEN}" > ./release/.npmrc
npm whoami

if [ "$SKIP_CHANGELOG_UPDATE" != true ]; then
  echo "Updating the CHANGELOG.md file"

  currentDate=$(date '+%Y-%m-%d')
  newReleasedContent="## [Unreleased]\n\n## ${VERSION} - ${currentDate}"
  # Moves the unreleased entries under the new version and leaves an empty `## [Unreleased]`
  # above it.
  sed "s/## \[Unreleased\]/${newReleasedContent}/" ./CHANGELOG.md > CHANGELOG.tmp.md
  mv -f CHANGELOG.tmp.md CHANGELOG.md

  git add ./CHANGELOG.md
fi

echo "Updating the version and committing the changes"

# `--force` lets `npm version` run with CHANGELOG.md staged, and its version commit takes the file.
npm version "$VERSION" --force

echo "Publishing the package to the NPM registry"

npm publish --dry-run="$DRY_RUN"

if [ "$DRY_RUN" != true ]; then
  echo "Pushing the changes to the remote repository"
  git push --follow-tags
fi

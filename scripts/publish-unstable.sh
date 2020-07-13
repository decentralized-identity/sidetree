#!/bin/bash

# This script handles the publishing of the current 
# commits as an npm based unstable package

# Example if the current package.json version reads 0.1.0 
# then the unstable release of 0.1.1-unstable.(current git commit reference)

# Add dev dependencies to current path
export PATH="$PATH:node_modules/.bin"

# Minor version the current package
npm version --no-git-tag-version --patch

# Fetch the current version from the package.json
new_version=$(node -pe "require('./package.json').version")

# Fetch the new unstable version
new_unstable_version=$new_version"-unstable.$(git rev-parse --short HEAD)"

# Set the unstable version in the package.json
npm version $new_unstable_version --no-git-tag-version

# Publish the unstable version
npm publish --tag unstable --no-git-tag-version

# Reset changes to the package.json
git checkout -- package.json
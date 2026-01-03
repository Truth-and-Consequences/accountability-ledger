#!/bin/bash
set -e

# Version bump script
# Usage: ./scripts/bump-version.sh [major|minor|patch]
# Example: ./scripts/bump-version.sh patch

BUMP_TYPE=${1:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
  echo "Error: Invalid bump type '$BUMP_TYPE'"
  echo "Usage: $0 [major|minor|patch]"
  exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Bump version based on type
case $BUMP_TYPE in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo "Error: You have uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Check we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "Warning: You are on branch '$CURRENT_BRANCH', not 'main'"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Update version in package.json
echo "Updating package.json..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Commit the version bump
echo "Creating commit..."
git add package.json
git commit -m "chore: bump version to v$NEW_VERSION"

# Generate release notes from commits since last tag
echo "Generating release notes..."
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [[ -n "$LAST_TAG" ]]; then
  RELEASE_NOTES=$(git log "$LAST_TAG"..HEAD --pretty=format:"- %s" --no-merges)
else
  # No previous tag, get all commits
  RELEASE_NOTES=$(git log --pretty=format:"- %s" --no-merges)
fi

# Create tag with release notes
echo "Creating tag v$NEW_VERSION..."
git tag -a "v$NEW_VERSION" -m "$(cat <<EOF
Release v$NEW_VERSION

## Changes

$RELEASE_NOTES
EOF
)"

# Push commit and tag
echo "Pushing to remote..."
git push origin "$CURRENT_BRANCH"
git push origin "v$NEW_VERSION"

echo ""
echo "✅ Version bumped to v$NEW_VERSION"
echo "   Tag v$NEW_VERSION pushed - GitHub Actions will deploy to production"

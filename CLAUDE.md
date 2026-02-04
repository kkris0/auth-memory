# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AuthMemory is a Chrome/Firefox browser extension that remembers which Google Account was used for specific third-party services and highlights it during subsequent logins. It's a Manifest V3 extension with a simple architecture.

## Build Commands

```bash
# Build browser packages (creates Chrome and Firefox .zip files in dist/)
npm run build

# Create a release (increments version, builds, and pushes tag)
npm run release
```

## Architecture

### Core Components

1. **Content Script** (`src/content.js`)
   - Runs on `https://accounts.google.com/*`
   - Extracts the destination service domain from URL parameters (`redirect_uri`, `continue`, `origin`, etc.)
   - Stores mapping of domain → email in Chrome storage when user clicks an account
   - Highlights previously used account for that specific domain
   - Uses MutationObserver to handle dynamic DOM updates

2. **Build System** (`scripts/build.js`)
   - Creates separate packages for Chrome and Firefox
   - Modifies manifest.json for Firefox compatibility (converts `service_worker` to `scripts[]`, adds `browser_specific_settings`)
   - Outputs versioned .zip files to `dist/`

### Key Logic Flow

1. User visits OAuth page (e.g., `accounts.google.com/...?redirect_uri=https://replit.com/...`)
2. Content script parses URL to extract destination domain (`replit.com`)
3. Script checks `chrome.storage.sync[domain]` for saved email
4. If found, highlights matching account row with badge showing service logo
5. When user clicks any account, email→domain mapping is saved to storage

### Domain Extraction Priority

The content script checks URL parameters in this order to find the real destination service:

1. `redirect_uri` (standard OAuth)
2. `continue` (Google standard)
3. `origin`
4. `app_domain`
5. `return_to`
6. `service` (fallback for Google-owned services)

Filters out Google infrastructure domains (`accounts.google.com`, `www.google.com`) to identify third-party apps.

### Storage Schema

```javascript
{
  "replit.com": "user@example.com",
  "vercel.com": "work@company.com",
  // ... domain -> email mappings
}
```

## Browser Compatibility

- **Chrome**: Uses manifest.json as-is with `service_worker` background
- **Firefox**: Build script converts manifest to use `background.scripts[]` and adds `browser_specific_settings.gecko`

## Important Files

- `manifest.json` - Extension manifest (Manifest V3)
- `src/content.js` - Main content script with all logic
- `src/styles.css` - Badge and highlight styling
- `scripts/build.js` - Cross-browser packaging script
- `icons/` - Extension icons (16x16, 48x48, 128x128)

## Testing During Development

Since there are no automated tests, manual testing workflow:

1. Make changes to `src/content.js` or `src/styles.css`
2. Run `npm run build` to create updated packages
3. Load unpacked extension in Chrome:
   - Extract `dist/auth-memory-chrome-v*.zip`
   - Go to `chrome://extensions`
   - Enable Developer Mode
   - Click "Load unpacked" and select extracted folder
4. Visit `accounts.google.com` with a service redirect to test

## Release Process

### IMPORTANT: Manual Steps Required

**CRITICAL:** `npm version patch` only updates `package.json` (and `package-lock.json`), but **NOT** `manifest.json`. You MUST manually update `manifest.json` to match, or the built packages will have incorrect version numbers.

### Step-by-Step Release Instructions

1. **Ensure clean working directory**
   ```bash
   git status  # Must show no uncommitted changes
   ```
   If there are uncommitted changes, commit them first before creating a release.

2. **Create release commit and initial push**
   ```bash
   npm run release
   ```
   This will:
   - Run `npm version patch` (bumps version in `package.json` only)
   - Run `npm run build` (creates .zip files, but with OLD version from manifest.json)
   - Run `git push --follow-tags` (pushes commit and tag)

3. **Update manifest.json to match package.json version**
   - Edit `manifest.json` and change the `"version"` field to match the new version in `package.json`
   - Example: If package.json shows `"version": "1.0.5"`, update manifest.json to `"version": "1.0.5"`

4. **Rebuild with correct version**
   ```bash
   npm run build
   ```
   This creates properly versioned .zip files (e.g., `auth-memory-chrome-v1.0.5.zip`)

5. **Amend the version commit to include manifest.json**
   ```bash
   git add manifest.json
   git commit --amend --no-edit
   ```

6. **Update the git tag to point to the amended commit**
   ```bash
   git tag -d v1.0.X  # Replace X with actual version
   git tag v1.0.X     # Recreate tag on amended commit
   ```

7. **Force push the corrected commit and tag**
   ```bash
   git push --force-with-lease
   git push --tags --force
   ```

### Quick Reference

```bash
# Full release sequence (after changes are committed):
npm run release
# Edit manifest.json to match package.json version
npm run build
git add manifest.json
git commit --amend --no-edit
git tag -d v1.0.X && git tag v1.0.X
git push --force-with-lease && git push --tags --force
```

### Why This Is Necessary

- `npm version` is designed for Node.js packages and only updates npm-related files
- Browser extensions require version numbers in `manifest.json` for the extension stores
- The build script reads version from `manifest.json` to name the .zip files
- Without updating manifest.json, the packages will have mismatched version numbers

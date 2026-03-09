# Archive Version Bump Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically increment `MARKETING_VERSION` only when the `Markdown` app is archived, so the archived app version advances from `1.0` to `1.1`, `1.2`, and so on.

**Architecture:** Add a final target shell script build phase guarded by archive-only environment checks. The script updates the app target `MARKETING_VERSION` in `project.pbxproj` and rewrites the current archive product `Info.plist` so the same archive uses the bumped version immediately.

**Tech Stack:** Xcode scheme XML, project.pbxproj, shell scripting, Python 3

---

### Task 1: Add a dedicated archive version bump script

**Files:**
- Create: `scripts/bump_archive_version.py`

**Steps:**
1. Read `Markdown.xcodeproj/project.pbxproj`.
2. Locate the `MARKETING_VERSION` assignments for the `Markdown` app target build configurations.
3. Parse versions in `major.minor` form.
4. Increment the version by one minor step, including `1.9 -> 2.0`.
5. Write the updated project file back only when a valid change is produced.

### Task 2: Wire the script into the app target archive-only path

**Files:**
- Modify: `Markdown.xcodeproj/project.pbxproj`

**Steps:**
1. Add a shell script build phase at the end of the `Markdown` target build phases.
2. Call the version bump script from the build phase using repository-relative paths.
3. Guard execution with archive-only environment checks so regular builds are unaffected.
4. Disable target-level user script sandboxing because this script must mutate `project.pbxproj` and the built `Info.plist`.

### Task 3: Verify normal builds do not change the version

**Files:**
- Verify only

**Steps:**
1. Read the current `MARKETING_VERSION` from `project.pbxproj`.
2. Run `xcodebuild build -scheme Markdown -configuration Release -destination 'platform=macOS'`.
3. Re-read `MARKETING_VERSION`.
4. Confirm the value is unchanged.

### Task 4: Verify archive bumps the version used by the app

**Files:**
- Verify only

**Steps:**
1. Run `xcodebuild archive -scheme Markdown -configuration Release -destination 'generic/platform=macOS' -archivePath /tmp/MarkdownVersionTest.xcarchive`.
2. Confirm `project.pbxproj` advanced from the previous version to the next one.
3. Read `/tmp/MarkdownVersionTest.xcarchive/Products/Applications/Markdown.app/Contents/Info.plist`.
4. Confirm `CFBundleShortVersionString` matches the updated version.

### Task 5: Document operator expectations

**Files:**
- Modify: `docs/plans/2026-03-09-archive-version-bump-design.md`

**Steps:**
1. Confirm the design doc reflects the implemented trigger point and version format.
2. Leave the expected dirty-worktree side effect explicit so future changes do not treat it as a bug.

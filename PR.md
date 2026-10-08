# Public release requirements and plan

Publish the image-downloader extension as a public GitHub repository with an installable ZIP. Keep personal collection data and signing keys out of the repository.

1. Prepare a source-only public distribution with empty exclusion lists.
2. Document installation, optional limits, local reload and folder permissions.
3. Run the 27 regression tests and inspect all tracked files.
4. Publish the repository and release ZIP; verify public visibility and release assets.

Version 1.0.6 stops on folder-write failure, checks permission before starting, and pauses discovery while queued images cover the quantity budget.

## 1.1.0 — Instagram support (2026-10-09)

Requirement: support Instagram profile image posts and image carousels using the signed-in browser. Retain optional quantity/date limits (blank means unlimited), stop/resume and existing X history. Keep platforms in separate output folders. No server, login automation, Stories or video downloads.

Plan:
1. Add Instagram profile/post/CDN parsing and rendered carousel traversal, with author and date checks.
2. Extend the existing queue and UI without migrating X records; add only required Instagram host permissions.
3. Verify carousel, filtering, limits, resume and X regressions with fixtures; attempt a signed-in live check when a test profile is available.
4. Synchronize the local extension, document limitations, and publish source/release to the existing public repository.

Instagram saves the largest image URL supplied by the rendered page, which may be compressed. Historical completeness depends on what the site loads. Live verification requires the user to sign in.

Completed: 36 automated tests pass. The installed v1.1.0 saved 11 valid, byte-distinct JPEGs from Instagram, including carousel images. Its latest run saved 9 new images and stopped at the configured limit of 9 with zero errors. Output files were independently decoded and hashed on 2026-10-09 (Asia/Taipei). Existing pending posts remain resumable.

# Public release requirements and plan

Publish the image-downloader extension as a public GitHub repository with an installable ZIP. Keep personal collection data and signing keys out of the repository.

1. Prepare a source-only public distribution with empty exclusion lists.
2. Document installation, optional limits, local reload and folder permissions.
3. Run the 27 regression tests and inspect all tracked files.
4. Publish the repository and release ZIP; verify public visibility and release assets.

Version 1.0.6 stops on folder-write failure, checks permission before starting, and pauses discovery while queued images cover the quantity budget.

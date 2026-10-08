# v1.1.0 verification — 2026-10-09

- `node --test tests/extension.test.cjs`: 36 passed, 0 failed.
- All 27 existing X regression tests pass.
- Nine Instagram tests cover trusted profile/post/CDN routing, largest supplied URL and signature preservation, author/avatar/recommendation filtering, the current div-based desktop layout, image/video/image carousel traversal, stuck Next controls, date limits, exact quantity limits with resume, expired signed-URL refresh, and direct-folder writes (some tests cover multiple cases).
- Inspected a signed-in public Instagram profile and carousel in the browser. Confirmed owner-prefixed `/username/p/shortcode/` links, div-based post containers without an `article`, the localized Next button, CDN image URLs and a distinct original-post timestamp. The production parser and regression fixture account for these observations.
- Installed-extension Instagram download verification: pending user reload of the extension. The browser automation interface blocks extension-management URLs. DOM inspection and simulated tests are not a completed end-to-end download test.

No external server, cookie extraction or AI image processing was used. Existing local personal exclusions are retained only in the local build; the public build continues to contain empty exclusion lists.

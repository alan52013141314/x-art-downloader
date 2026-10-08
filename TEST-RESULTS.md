# v1.1.0 verification — 2026-10-09

- `node --test tests/extension.test.cjs`: 36 passed, 0 failed.
- All 27 existing X regression tests pass.
- Nine Instagram tests cover trusted profile/post/CDN routing, largest supplied URL and signature preservation, author/avatar/recommendation filtering, the current div-based desktop layout, image/video/image carousel traversal, stuck Next controls, date limits, exact quantity limits with resume, expired signed-URL refresh, and direct-folder writes (some tests cover multiple cases).
- Inspected a signed-in public Instagram profile and carousel in the browser. Confirmed owner-prefixed `/username/p/shortcode/` links, div-based post containers without an `article`, the localized Next button, CDN image URLs and a distinct original-post timestamp. The production parser and regression fixture account for these observations.
- Installed-extension Instagram download verification completed on 2026-10-09 (Asia/Taipei), after the user reloaded v1.1.0 and renewed output-folder permission. The installed extension reports 11 saved images in total, 9 newly saved in the latest run with a 9-image limit, automatic stop at that limit, and 0 errors. Reader records include a three-image carousel and single-image posts.
- Independently checked the output folder: all 11 JPEG files fully decode, all 11 SHA-256 hashes differ, total size 7,469,367 bytes. Image dimensions range from 1292 to 2700 pixels wide. Files are present beneath the Instagram account subfolder.
- The earlier attempted run correctly refused to start while folder permission was unavailable. Pending posts remain queued after the successful capped run; this check does not claim the entire account is archived.

No external server, cookie extraction or AI image processing was used. Existing local personal exclusions are retained only in the local build; the public build continues to contain empty exclusion lists.

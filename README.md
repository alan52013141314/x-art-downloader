# X / Instagram Art Downloader · 畫師圖片收藏

A local Manifest V3 browser extension that collects images from an X artist media page or an Instagram profile. Traditional Chinese interface. No external server or AI image processing.

## Install

1. Download the release ZIP and extract it.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Enable Developer mode, choose **Load unpacked**, and select the `extension` folder.
4. Sign in normally, then open an artist profile’s **Media / 相片** tab on X, or the **Posts / 貼文** tab of an Instagram profile.

When updating from 1.0.x, reload the existing extension and refresh the source page. The browser may ask you to allow the newly added Instagram and image-CDN hosts. Existing X collection history remains intact.

## Use

- Open the extension toolbar popup or the green **圖片收藏** button on the page.
- **本次新增圖片上限** limits newly saved files in this run. Completed files do not consume a later run’s budget.
- **發文起日 / 發文迄日** are inclusive posting dates in your browser timezone. Leave all three fields blank for no quantity or date limit.
- Choose **開始／接續收集**. Keep the artist media page open. The extension scrolls and opens a reader tab to inspect each post’s attachments.
- X files go under `to be deleted folder/<artist>/`; Instagram files go under `to be deleted folder/Instagram/<username>/`. The name is a staging convention; files are never automatically deleted. Histories are separated by platform even when usernames match.
- **停止** pauses collection; **重試未完成項目** retries retained failures and pending work.

## Direct folder storage

If your embedded browser cancels normal downloads, open the **toolbar extension popup**, choose **選擇儲存資料夾**, and select your destination. The page panel cannot grant this permission. File access is stored within the extension, not on the source website.

Reloading the extension or restarting the browser can revoke folder permission. Select the same folder again. Version 1.0.6 checks permission before starting and stops on storage failure instead of opening posts indefinitely. Existing files are preserved with numbered filenames on collisions.

## Local update button

Replace the local `extension` files with the new version, then click **重新載入本機更新** while stopped. This reloads local files and preserves progress; it does **not** fetch or install updates from GitHub. You may need to select your output folder again.

## Scope and limitations

- Downloads original-size image URLs provided by rendered X pages, retaining original bytes and watermarks.
- Instagram: inspects the author's image posts and advances image carousels using the visible Next control. Saves the largest supplied image URL, with signed query parameters intact; Instagram may already have compressed it. Reels, Stories and video files are excluded; image slides within mixed carousels are supported.
- Instagram posting dates come from the original post's timestamp, not comments. If a date limit is set and the timestamp cannot be verified, the post is retained as an error instead of downloading outside the requested range. With no date limit, missing dates use `unknown-date` in filenames.
- Instagram CDN URLs can expire. **重試未完成項目** reopens failed image sources to obtain current URLs. Unreadable authors or stalled carousels remain retryable errors rather than being reported as complete.
- Filters by post author; excludes avatars, quoted authors’ attachments and video. Does not classify artwork versus photos or detect AI images.
- Deduplicates by media ID within extension history. Does not scan an existing image library or deduplicate visually similar reuploads.
- Historical completeness depends on what the source website loads. Deleted, protected, unavailable and rate-limited posts cannot be guaranteed. Scanning stops after repeated attempts reveal no new posts; this is not proof that an entire account has been archived.
- X and Instagram can change their page structures. This is an independent project and is not affiliated with X, Instagram, Meta or OpenAI.
- Public package contains no personal artist lists, collection records, images, account credentials or signing key.
- Permissions: downloads, extension-local storage, alarms, X/Twitter and Instagram pages, `pbs.twimg.com`, `*.cdninstagram.com` and `*.fbcdn.net`. No cookie permission. No credentials are exported.
- X and Instagram were tested in a Chromium embedded browser. Instagram verification includes 11 decoded output files, carousel attachments and automatic stop after a 9-image run; see `TEST-RESULTS.md`. Chrome/Edge have not been separately tested here.

## Development

Requires Node.js 20 or newer.

```sh
npm ci
npm test
```

36 tests cover X regressions and Instagram routing, current div-based layout, author/avatar filtering, signed URLs, image/video carousels, stalled navigation, inclusive dates, quantity caps, resume and direct-folder writes. Simulated end-to-end tests verify that limits stop at the requested successful file count.

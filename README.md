# X Art Downloader / X 畫師圖片收藏

A local Manifest V3 browser extension that collects images from the artist media page you open on X. Traditional Chinese interface. No external server or AI image processing.

## Install

1. Download the release ZIP and extract it.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Enable Developer mode, choose **Load unpacked**, and select the `extension` folder.
4. Open an artist profile’s **Media / 相片** tab while signed in to X.

## Use

- Open the extension toolbar popup or the green **圖片收藏** button on the page.
- **本次新增圖片上限** limits newly saved files in this run. Completed files do not consume a later run’s budget.
- **發文起日 / 發文迄日** are inclusive posting dates in your browser timezone. Leave all three fields blank for no quantity or date limit.
- Choose **開始／接續收集**. Keep the artist media page open. The extension scrolls and opens a reader tab to inspect each post’s attachments.
- Files go under `to be deleted folder/<artist>/`. The name is a staging convention; files are never automatically deleted.
- **停止** pauses collection; **重試未完成項目** retries retained failures and pending work.

## Direct folder storage

If your embedded browser cancels normal downloads, open the **toolbar extension popup**, choose **選擇儲存資料夾**, and select your destination. The page panel cannot grant this permission. File access is stored within the extension, not on X.

Reloading the extension or restarting the browser can revoke folder permission. Select the same folder again. Version 1.0.6 checks permission before starting and stops on storage failure instead of opening posts indefinitely. Existing files are preserved with numbered filenames on collisions.

## Local update button

Replace the local `extension` files with the new version, then click **重新載入本機更新** while stopped. This reloads local files and preserves progress; it does **not** fetch or install updates from GitHub. You may need to select your output folder again.

## Scope and limitations

- Downloads original-size image URLs provided by rendered X pages, retaining original bytes and watermarks.
- Filters by post author; excludes avatars, quoted authors’ attachments and video. Does not classify artwork versus photos or detect AI images.
- Deduplicates by media ID within extension history. Does not scan an existing image library or deduplicate visually similar reuploads.
- Historical completeness depends on what X loads. Deleted, protected, unavailable and rate-limited posts cannot be guaranteed.
- X can change its page structure. This is an independent project and is not affiliated with X or OpenAI.
- Public package contains no personal artist lists, collection records, images, account credentials or signing key.
- Permissions: downloads, extension-local storage, alarms, and access to X/Twitter pages and the X image CDN. No cookie permission.
- Tested in a Chromium embedded browser; Chrome/Edge support is based on the Manifest V3 APIs and has not been separately verified here.

## Development

Requires Node.js 20 or newer.

```sh
npm ci
npm test
```

27 tests cover attachment parsing, date bounds, quantity limits, retries, stop/resume, reader reconnection, UI controls, local reload, and direct-folder failures. Simulated end-to-end test verifies that a no-date-limit run saves exactly 10 images and leaves excess posts unopened.

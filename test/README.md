# Tests

Regression tests for `admin.html`. Optional — the gallery itself has no build step and no dependencies, and nothing here is needed to publish a job or serve the site.

## Running

```bash
npm install
npx playwright install chromium
npm test
```

The test drives the real `admin.html` in a headless browser with every call to `api.github.com` intercepted, so it needs no token and never touches a real repository. It asserts on the exact `manifest.json` payload that would be committed.

## What it covers

The publish flow used to rebuild `manifest.json` from the drop zones alone, which meant adding a handful of photos to an already-delivered gallery quietly dropped every photo already published. These cases guard that behavior:

- **Add mode** merges dropped files into what is already live (60 published + 5 dropped = 65 listed)
- **Editing text with no files dropped** keeps all published photos, so fixing an intro typo is safe
- **Replace mode** lists only the dropped files, and warns how many published photos it discards
- **The empty guard** refuses to commit a gallery with zero photos
- **A wrong branch** aborts instead of reading as an empty gallery, since a missing manifest and a bad ref both return 404
- **A fresh repo** with no manifest yet publishes normally
- **Oversized files** are skipped with a warning rather than failing the whole publish

If you change the publish logic, run this first.

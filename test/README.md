# Tests

Regression tests for the admin page and the delivered gallery. Optional — the site has no build step and no runtime dependencies, and nothing here is needed to publish a job.

## Running

```bash
npm install
npx playwright install chromium
npm run test:all
```

Both suites intercept every call to GitHub, so they need no token and never touch a real repository.

## `publish.spec.js` — the admin page

Drives `admin.html` in a headless browser and asserts on the exact `manifest.json`, tree, and Release uploads a publish would produce.

Publishing once rebuilt the photo list from the drop zones alone, so adding a few photos to a delivered gallery quietly dropped every photo already published. These cases guard that:

- **Add mode** merges into what is live (60 published + 2 dropped = 62 listed)
- **A text-only edit** with nothing dropped keeps all 60
- **Replace mode** lists only the dropped files and warns what it discards
- **The empty guard** refuses to commit a gallery with zero photos
- **A wrong branch** aborts instead of reading as an empty gallery, since a missing manifest and a bad ref both 404

Plus the multi-client and Release behavior:

- The overview lists client folders and hides `_template` and `test`
- A new client gets its own folder, a copy of the gallery page, and a Release
- Full-resolution goes to Release assets and never into the repo tree
- Republishing deletes an existing asset before re-uploading, rather than failing
- Filenames GitHub would rewrite are mapped so downloads still resolve
- The refresh checkbox rewrites a delivered gallery's page, and leaves it alone otherwise

## `gallery.spec.js` — the delivered page

Serves `_template/index.html` from a realistic URL and checks it renders the manifest and points downloads correctly: full-resolution at the Release, social at the local folder, renamed assets through the `fullNames` map, and galleries predating Releases still falling back to a local `full/` folder.

# deliver — client photo galleries

Every client gallery lives in this one repo, each in its own folder, served by GitHub Pages.

```
https://ramidaud.github.io/deliver/mansfield-family/
https://ramidaud.github.io/deliver/smith-wedding/
```

There is no build step and nothing to install. You publish through `admin.html` in your browser.

---

## Delivering a job

1. Export from Lightroom into two sets (specs below)
2. Open **`https://ramidaud.github.io/deliver/admin.html`**
3. Paste your token, click **Connect**
4. **+ New client gallery**, type the client name (the folder fills in automatically)
5. Drag the exports into the hero, social, and full-resolution drop zones
6. **Publish gallery**
7. Wait a minute or two, open the link, send it to the client

Adding photos to a job you already delivered is the same flow: **Connect**, **Manage** on that gallery, drop the new files, publish. Existing photos are kept.

---

## Layout

```
.
├── index.html              neutral landing page, names no clients
├── admin.html              the control panel
├── _template/index.html    master gallery, copied into each client folder
├── test/                   optional regression tests
└── mansfield-family/       one client
    ├── index.html          copy of the template, frozen at publish time
    ├── manifest.json       name, date, intro, photo list, download URLs
    ├── social/             what visitors see
    └── hero/               banner images
```

Full-resolution files are **not** in the repo. They go to a GitHub Release tagged with the client's folder name, which does not count toward repo size. See below.

Each client folder gets its own copy of the gallery page, so improving `_template/index.html` never disturbs a gallery you have already sent. To pull a delivered gallery up to the current template, tick **Update this gallery's page design** before publishing.

---

## Where the files go, and why

| | lives in | typical size per job |
|---|---|---|
| social | the repo | ~57 MB |
| hero | the repo | ~18 MB |
| full-resolution | a GitHub Release | ~650 MB |

GitHub asks that repos and Pages sites stay under 1 GB. Full-resolution is roughly 90% of a job's weight, so keeping it in the repo would use up that budget in two jobs. Release assets are exempt from repo size limits and are free to download on public repos, so the repo grows about 75 MB per job instead — on the order of a dozen jobs before size is worth revisiting.

Deleting a client folder does **not** shrink the repo, because git keeps every version forever. Deleting a Release does free its space. That asymmetry is the main reason full-resolution is kept out of git.

---

## Token setup

One token covers every gallery, since they all live in this repo.

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
2. Repository access: **Only select repositories** → pick `deliver`
3. Repository permissions → **Contents: Read and write**
4. Generate, copy it (GitHub shows it once), paste into `admin.html`

Contents covers both files and Releases, so nothing else is needed.

The token stays in your browser. Tick **Remember token on this device** to keep it between visits; otherwise it clears when you close the tab. It is only ever sent to `api.github.com` and `uploads.github.com`.

---

## Lightroom export settings

**social/** — what visitors see and share
- JPEG, sRGB, Quality 80
- Resize: 2048 px long edge
- Sharpening: Standard, Screen
- Metadata: all except location

**full-resolution** — the takeaway
- JPEG, sRGB, Quality 100
- No resize
- Sharpening: your usual delivery preset
- Metadata: copyright, no GPS

Export both passes from the same picks so the filenames line up. The admin page warns when a filename appears in one set but not the other.

Avoid spaces and brackets in filenames. GitHub rewrites those characters on Release uploads; the admin page detects it, warns you, and records the new name so downloads still resolve, but clean names keep things simpler.

---

## Add mode vs replace mode

Publishing **adds** by default: whatever is already live stays, and dropped files merge in. Editing just the intro with nothing dropped leaves every photo in place.

Tick **Start fresh** only when the gallery should contain nothing but the files currently dropped, such as a re-export under new filenames. The line above the publish button always states the resulting photo count first.

---

## Privacy

GitHub Pages has no login, so nothing here is truly private:

- **The client list is effectively private.** `admin.html` contains no client data. It asks GitHub for the list using your token, so anyone opening the URL sees an empty form.
- **Galleries are public URLs.** That is what makes them shareable. They are unlisted and carry `noindex`, but anyone with the link can open one.
- **Folder names are visible** to anyone browsing this repo on github.com. Making the repo private would hide them, but Pages from a private repo needs a paid GitHub plan.

---

## Limits worth knowing

- Files in the repo: ~70 MB each. The API sends base64, which inflates payloads about a third against GitHub's 100 MB limit.
- Release assets: 2 GB each.
- The combined full-resolution zip is built in your browser and is skipped above 1.5 GB, since assembling more than that tends to exhaust memory. Individual downloads are unaffected.
- Uploading a full job takes a few minutes on a typical connection. The log panel shows progress.

---

## Tests

Optional, and not needed to publish:

```bash
npm install
npx playwright install chromium
npm test          # admin publishing logic
npm run test:gallery   # the delivered gallery page
```

They run against a mocked GitHub, so they need no token and touch nothing real. See `test/README.md`.

# Photo Delivery Gallery — setup guide

Single-file gallery for client photo delivery. Drop in your photos, push to GitHub Pages, send the link.

---

## Checklist for a new client job

- [ ] From this repo's GitHub page, click **Use this template** → **Create a new repository**, name it for the client
- [ ] Enable GitHub Pages on the new repo: Settings → Pages → Deploy from branch → main → / (root)
- [ ] Add the new repo to your token's repository list (see [token setup](#one-time-setup--create-a-token) — skipping this is the usual cause of a 403 on publish)
- [ ] Export photos from Lightroom into `full/` and `social/` (identical filenames in each)
- [ ] Fill in client name, date, intro, and upload the photos via `admin.html`
- [ ] Wait 1 to 2 minutes, visit your URL, test on phone
- [ ] Send the link to the client

> **Setup once:** turn on Settings → General → **Template repository** in this repo so the "Use this template" button appears. It creates each client repo with fresh history, which is what you want — a fork would carry another client's commits.

---

## Using the admin CMS (`admin.html`)

The repo ships with `admin.html` — a page you open in your browser to fill in job details and upload photos without touching git. It writes directly to this repo over the GitHub API and commits everything in one shot.

**One-time setup — create a token:**

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
2. Repository access: **Only select repositories** → pick the gallery repo(s)
3. Permissions → Repository permissions → **Contents: Read and write**
4. Generate, copy the token (you won't see it again)

One token can cover every client gallery: edit it and add each new repo to its repository list as you create them. A 403 on publish almost always means the repo isn't on that list yet.

**Publishing a job:**

1. Visit `https://<your-username>.github.io/<repo-name>/admin.html`
2. Paste the token, confirm owner/repo/branch (auto-filled from the URL when possible)
3. Click **Load current site data** — fills in the existing details and shows what's already published
4. Fill in client name, date, intro
5. Drag your `hero/`, `full/`, and `social/` exports into their respective drop zones
6. Click **Publish gallery** — it commits everything at once and shows a link to the live page

The token stays in your browser only (opt in to "Remember token on this device" to keep it across visits — otherwise it clears on refresh). Nothing is sent anywhere except `api.github.com`.

**Add mode vs replace mode.** By default publishing *adds* to the gallery: whatever is already published stays, and dropped files are merged in. This is what you want when sending a client a few extra frames, or fixing a typo in the intro without re-uploading anything. Tick **Start fresh** only when you genuinely want the gallery to contain nothing but the files currently dropped in — for instance if you re-exported a job under new filenames. The line above the publish button always states the resulting photo count before you commit.

**Limits:** the API sends files base64-encoded, which inflates them by about a third, so the practical per-file ceiling is ~70MB against GitHub's 100MB blob limit. Oversized files are listed and skipped rather than failing the publish. Uploading many large files can take a few minutes depending on your connection — the log panel shows progress as it goes.

**Repo and Pages size.** GitHub asks that Pages sites stay under 1GB. A full-res gallery can run several times that. It has worked in practice, but it is unsupported, so for recurring work plan on the Cloudflare R2 move described at the bottom of this file.

---

## Folder structure

```
.
├── index.html
├── manifest.json
├── full/
│   ├── IMG_0001.jpg
│   └── ...
└── social/
    ├── IMG_0001.jpg
    └── ...
```

**Filenames must match between the two folders.** The gallery loads thumbnails from `social/` and pulls downloads from both.

---

## Lightroom export settings

**`social/` folder (the version visitors see and share):**
- Format: JPEG, sRGB, Quality 80
- Resize: 2048 px on the long edge
- Sharpening: Standard, Screen
- Metadata: All except location

**`full/` folder (the takeaway):**
- Format: JPEG, sRGB, Quality 100
- No resize
- Sharpening: your usual delivery preset
- Metadata: copyright info, no GPS

Export both passes from the same picks so filenames stay aligned.

---

## Generating manifest.json manually

`admin.html` writes this file for you. Use the steps below only if you're publishing by hand instead.

After exports finish, run from the project root.

**Bash with jq:**

```bash
ls social/ | grep -iE '\.(jpg|jpeg|png)$' | sort | jq -R -s '{client: "Client Name", date: "Month Year", photos: split("\n") | map(select(length > 0))}' > manifest.json
```

**Python (no dependencies):**

```python
import json, os
files = sorted(f for f in os.listdir('social') if f.lower().endswith(('.jpg','.jpeg','.png')))
manifest = {
    "client": "Client Name",
    "date": "Month Year",
    "intro": "A selection from the shoot. Click any image to view full size and download.",
    "photos": files
}
json.dump(manifest, open('manifest.json','w'), indent=2)
```

---

## Manifest schema

```json
{
  "client": "Display name shown as the page title",
  "date": "Subtitle under the title",
  "intro": "Optional paragraph below the title (omit to use default)",
  "photos": ["IMG_0001.jpg", "IMG_0002.jpg", "..."]
}
```

---

## Customization

- **Client name and date:** in `manifest.json`
- **Color palette:** CSS variables at the top of the `<style>` block in `index.html` (`--bg`, `--accent`, etc.)
- **Typography:** the Google Fonts link in `<head>`, currently Fraunces + DM Sans
- **Footer text and email:** bottom of `<body>`

---

## Notes on GitHub limits

GitHub's 1 GB repo guideline is a soft limit. A single gallery at full res can easily run 5 to 7 GB, and you may get a warning email but the repo will still work. If client galleries become a recurring thing, switch to **Cloudflare R2 + Cloudflare Pages**: 10 GB free storage, no egress fees, no subscription.

---

## Status

- [ ] Photos edited
- [ ] Photos exported (both sizes)
- [ ] Repo created on GitHub
- [ ] Files pushed
- [ ] Pages enabled
- [ ] Tested on phone
- [ ] Link sent to client

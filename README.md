# Photo Delivery Gallery — setup guide

Single-file gallery for client photo delivery. Drop in your photos, push to GitHub Pages, send the link.

---

## Checklist for a new client job

- [ ] Create a new repo on GitHub as a copy of this template (not a fork — no shared history)
- [ ] Push the repo, enable GitHub Pages: Settings → Pages → Deploy from branch → main → / (root)
- [ ] Export photos from Lightroom into `full/` and `social/` (identical filenames in each)
- [ ] Fill in client name, date, intro, and upload the photos — either via `admin.html` (see below) or by hand
- [ ] Wait 1 to 2 minutes, visit your URL, test on phone
- [ ] Send the link to the client

---

## Using the admin CMS (`admin.html`)

The repo ships with `admin.html` — a page you open in your browser to fill in job details and upload photos without touching git. It writes directly to this repo over the GitHub API and commits everything in one shot.

**One-time setup — create a token:**

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
2. Repository access: **Only select repositories** → pick this one repo
3. Permissions → Repository permissions → **Contents: Read and write**
4. Generate, copy the token (you won't see it again)

**Publishing a job:**

1. Visit `https://<your-username>.github.io/<repo-name>/admin.html`
2. Paste the token, confirm owner/repo/branch (auto-filled from the URL when possible)
3. Fill in client name, date, intro
4. Drag your `hero/`, `full/`, and `social/` exports into their respective drop zones
5. Click **Publish gallery** — it commits everything at once and shows a link to the live page

The token stays in your browser only (opt in to "Remember token on this device" to keep it across visits — otherwise it clears on refresh). Nothing is sent anywhere except `api.github.com`.

**Limits:** GitHub's Contents API caps individual files at 100MB (full-res JPEGs are almost never that large). Uploading many large files from the admin page can take a few minutes depending on your upload speed — the log panel shows progress as it goes.

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

# Photo Delivery Gallery — project context

## What this is

A reusable client photo delivery page template. Built as a single static HTML file plus two folders of images. Hosted on GitHub Pages, no backend, no subscription service.

The photographer is Rami Daud (Senior Photographer, Kent State University Communications and Marketing). Originally built for a Sweet 16 shoot, generalized into a template for any client job.

## Architecture

```
.
├── index.html        Single-file gallery, vanilla JS, no build step
├── manifest.json     Client name, date, intro copy, photo filename array
├── README.md         Setup guide and Lightroom export specs
├── full/             Full-resolution JPGs (Quality 100, no resize)
└── social/           Social-ready JPGs (Quality 80, 2048px long edge)
```

Filenames in `full/` and `social/` must match exactly. The gallery loads thumbnails from `social/` and offers downloads from both folders. The download-all zip filename is derived automatically from `manifest.json`'s `client` field, no code edits needed per job.

## Design system

- **Type:** Fraunces italic (display) + DM Sans (body), via Google Fonts
- **Palette:** Cream paper background `#f5f1ea`, champagne accent `#b8884a`, deep ink `#2a2522`
- **Aesthetic:** Soft editorial, photographer-portfolio quality, photos as the heroes

CSS variables are at the top of the `<style>` block in `index.html`.

## Lightroom export specs

**`social/`:** JPEG, sRGB, Quality 80, long edge 2048 px, Standard sharpening for Screen
**`full/`:** JPEG, sRGB, Quality 100, no resize, normal delivery sharpening

Export both passes from the same picks so filenames stay aligned.

## Checklist for a new client job

- [ ] Photos exported into `full/` and `social/` from Lightroom
- [ ] `manifest.json` regenerated with real client name, date, and photo array
- [ ] Repo initialized and pushed to GitHub (as a copy of this template, not a fork with old history)
- [ ] GitHub Pages enabled (Settings → Pages → Deploy from branch → main → /root)
- [ ] Phone-tested on cellular
- [ ] Link sent to client

## How to regenerate manifest.json

After exports finish, from the project root:

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

## Writing voice for any client-facing copy

No em dashes. Concise and precise. Conversational but not casual. Emotional payoff earned through specificity rather than adjectives.

## Constraints

- No paid services or subscriptions
- No backend, no database, no auth
- Must work on phones (clients will often view and share from their phones)
- GitHub repo will exceed the 1 GB soft limit at full res. That's expected and acceptable for one-off delivery.

## Future direction

If client galleries become recurring, migrate to **Cloudflare R2 + Cloudflare Pages**: 10 GB free storage, no egress fees, no subscription. The same `index.html` template will work, just point image paths at the R2 bucket URL.

# deliver — project context

## What this is

Every client photo gallery Rami Daud delivers, in one repo, one folder per client, served by GitHub Pages. Static HTML and vanilla JS, no build step, no backend, no subscription.

The photographer is Rami Daud (Senior Photographer, Kent State University Communications and Marketing). This started as a one-off Sweet 16 gallery, became a per-client template, and is now a single repo with a browser-based admin page.

## Architecture

```
.
├── index.html              Neutral landing page. Must never name a client.
├── admin.html              Browser CMS: publishes via the GitHub API
├── _template/index.html    Master gallery, copied into each client folder
├── test/                   Playwright regression tests, mocked GitHub
└── <client-slug>/
    ├── index.html          Copy of the template, frozen at publish time
    ├── manifest.json       client, date, intro, hero[], photos[], fullBase, fullZip, fullNames
    ├── social/             2048px previews, served from the repo
    └── hero/               Banner images, served from the repo
```

Gallery URL is `https://ramidaud.github.io/deliver/<client-slug>/`.

## Where files live

- **social/ and hero/** go in the repo, roughly 75 MB per job
- **Full-resolution goes to a GitHub Release** tagged with the client slug, roughly 650 MB per job

Release assets do not count toward repo size, and deleting a Release frees the space while deleting a folder does not (git keeps history forever). That asymmetry is the whole reason full-res is kept out of git. Putting it in the repo would exhaust GitHub's 1 GB guidance in about two jobs.

`manifest.json` carries `fullBase` (Release download URL prefix) and `fullZip` (combined archive). When absent, the gallery falls back to a local `full/` folder so galleries published before this change still work. `fullNames` maps original filenames to the sanitized names GitHub assigns on upload, and is only present when they differ.

## Publishing behavior (important)

Publishing **merges by default**. It re-reads the live manifest and adds to it, so dropping five new photos into a delivered sixty-photo gallery yields sixty-five, and editing the intro with nothing dropped keeps all sixty. "Start fresh" opts into replacement. Publishing an empty gallery is refused.

A missing manifest and a wrong repo/branch both return 404. The code confirms the branch ref resolves before treating a 404 as "no manifest yet" — otherwise a typo would read as an empty gallery and wipe the photo list.

Each client folder holds its own copy of the gallery page, so editing `_template/index.html` never disturbs a delivered gallery. The "update this gallery's page design" checkbox opts a gallery into the current template.

## Design system

- **Type:** Fraunces italic (display) + DM Sans (body), via Google Fonts
- **Palette:** Cream paper `#f5f1ea`, ink `#2a2522`, accent `#6c47ff`
- **Aesthetic:** Soft editorial, photographer-portfolio quality, photos as the heroes

CSS variables sit at the top of each file's `<style>` block.

## Lightroom export specs

**social:** JPEG, sRGB, Quality 80, long edge 2048 px, Standard sharpening for Screen
**full-resolution:** JPEG, sRGB, Quality 100, no resize, normal delivery sharpening

Export both passes from the same picks so filenames stay aligned. Avoid spaces and brackets: GitHub rewrites those in Release asset names.

## Constraints

- No paid services or subscriptions
- No backend, no database, no auth
- Must work on phones (clients view and share from phones)
- Client-facing pages must not leak other clients' names

## Privacy model

GitHub Pages cannot authenticate, so nothing is truly private. `admin.html` is public but holds no client data — it fetches the list with the token at runtime, so an uninvited visitor sees an empty form. Galleries are unlisted public URLs carrying `noindex`. Folder names are visible to anyone browsing the repo; hiding them would require a private repo, which needs a paid plan for Pages.

## Writing voice for any client-facing copy

No em dashes. Concise and precise. Conversational but not casual. Emotional payoff earned through specificity rather than adjectives.

## Testing

`npm run test:all` drives both pages in headless Chromium against a fully mocked GitHub. No token, nothing real is touched. Run it before changing publish logic — the merge behavior above is easy to break and the failure mode is silent data loss in a delivered gallery.

## Future direction

If volume outgrows this, move to **Cloudflare R2 + Cloudflare Pages**: 10 GB free, no egress fees, no subscription. The gallery template works unchanged, pointing `fullBase` and image paths at the bucket URL.

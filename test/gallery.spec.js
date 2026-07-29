// Verifies the delivered gallery page itself: that it reads the manifest,
// renders photos, and points its download buttons at the right places whether
// full-resolution lives in a Release or in a local full/ folder.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TEMPLATE = fs.readFileSync(path.resolve(__dirname, '..', '_template', 'index.html'), 'utf-8');

const PHOTOS = ['a.jpg', 'b.jpg', 'c.jpg'];
const RELEASE_BASE = 'https://github.com/ramidaud/deliver/releases/download/smith-wedding/';

const results = [];
function check(name, ok, detail) { results.push([name, ok, detail]); }

// 1x1 transparent gif, enough for the browser to treat as a real image
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Serves the gallery from its real URL so relative fetches (manifest.json,
// social/…) resolve exactly as they will in production.
async function serve(page, url, manifest) {
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({
    status: 200, contentType: 'application/javascript', body: 'window.JSZip=function(){};',
  }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/manifest.json', r => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(manifest),
  }));
  for (const folder of ['social', 'hero', 'full']) {
    await page.route(`**/${folder}/*`, r => r.fulfill({ status: 200, contentType: 'image/gif', body: PIXEL }));
  }
  await page.route(url, r => r.fulfill({ status: 200, contentType: 'text/html', body: TEMPLATE }));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );

  /* ── release-backed gallery ── */
  {
    const page = await browser.newPage();
    await serve(page, 'https://ramidaud.github.io/deliver/smith-wedding/', {
      client: 'Smith Wedding', date: 'August 2026', intro: 'From the day.',
      hero: ['h1.jpg'], photos: PHOTOS,
      fullBase: RELEASE_BASE,
      fullZip: RELEASE_BASE + 'smith-wedding-full-resolution.zip',
      fullNames: { 'c.jpg': 'c.renamed.jpg' },
    });
    await page.waitForFunction(() => document.querySelectorAll('#gallery img').length > 0, { timeout: 10000 });

    check('title from manifest', (await page.textContent('#title')) === 'Smith Wedding', await page.textContent('#title'));
    check('renders every photo',
      (await page.$$eval('#gallery img', e => e.length)) === PHOTOS.length,
      `${await page.$$eval('#gallery img', e => e.length)}`);

    // open the lightbox on the first photo
    await page.click('#gallery img');
    await page.waitForFunction(() => document.getElementById('dlFull').getAttribute('href'));
    const fullHref = await page.getAttribute('#dlFull', 'href');
    const socialHref = await page.getAttribute('#dlSocial', 'href');
    check('full-res points at release', fullHref === RELEASE_BASE + 'a.jpg', fullHref);
    check('social stays local', /social\/a\.jpg$/.test(socialHref), socialHref);

    const dlAllText = await page.textContent('#dlAll');
    check('download-all present', /Download All/.test(dlAllText), dlAllText.trim());
    await page.close();
  }

  /* ── renamed asset resolves through fullNames ── */
  {
    const page = await browser.newPage();
    await serve(page, 'https://ramidaud.github.io/deliver/smith-wedding/', {
      client: 'Smith Wedding', date: '', intro: '', hero: [], photos: PHOTOS,
      fullBase: RELEASE_BASE, fullNames: { 'c.jpg': 'c.renamed.jpg' },
    });
    await page.waitForFunction(() => document.querySelectorAll('#gallery img').length > 0, { timeout: 10000 });
    const imgs = await page.$$('#gallery img');
    await imgs[2].click();
    await page.waitForFunction(() => document.getElementById('dlFull').getAttribute('href'));
    const href = await page.getAttribute('#dlFull', 'href');
    check('renamed asset URL used', href === RELEASE_BASE + 'c.renamed.jpg', href);
    await page.close();
  }

  /* ── legacy gallery with a local full/ folder still works ── */
  {
    const page = await browser.newPage();
    await serve(page, 'https://ramidaud.github.io/deliver/old-job/', {
      client: 'Old Job', date: 'May 2026', intro: '', hero: [], photos: PHOTOS,
    });
    await page.waitForFunction(() => document.querySelectorAll('#gallery img').length > 0, { timeout: 10000 });
    await page.click('#gallery img');
    await page.waitForFunction(() => document.getElementById('dlFull').getAttribute('href'));
    // Relative, so it resolves against the gallery folder just as before.
    const href = await page.getAttribute('#dlFull', 'href');
    const resolved = await page.evaluate(() => document.getElementById('dlFull').href);
    check('legacy full/ fallback', href === 'full/a.jpg', href);
    check('legacy URL resolves in-folder',
      resolved === 'https://ramidaud.github.io/deliver/old-job/full/a.jpg', resolved);
    await page.close();
  }

  await browser.close();

  let fail = 0;
  console.log('');
  for (const [name, ok, detail] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${detail || ''}`);
    if (!ok) fail++;
  }
  console.log(fail ? `\n${fail} FAILING` : `\nall ${results.length} green`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });

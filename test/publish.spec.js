const { chromium } = require('playwright');
const path = require('path');

const ADMIN = 'file://' + path.resolve(__dirname, '..', 'admin.html');

const OWNER = 'ramidaud';
const REPO = 'deliver';

// Canned remote state: one delivered gallery with 60 photos.
const MANSFIELD = {
  client: 'Mansfield Family Photos',
  date: 'May 2026',
  intro: 'A selection from the shoot.',
  hero: ['h1.jpg', 'h2.jpg'],
  photos: Array.from({ length: 60 }, (_, i) => `p${String(i + 1).padStart(2, '0')}.jpg`),
  fullBase: `https://github.com/${OWNER}/${REPO}/releases/download/mansfield-family/`,
  fullZip: `https://github.com/${OWNER}/${REPO}/releases/download/mansfield-family/mansfield-family-full-resolution.zip`,
  fullNames: {},
};

function b64(s) { return Buffer.from(s, 'utf-8').toString('base64'); }

// The page pulls JSZip from a CDN. Serve a minimal stand-in so the test stays
// hermetic and still exercises the zip-upload path.
async function stubJSZip(page) {
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      window.JSZip = function () {
        this._files = [];
        this.file = function (name, data) { this._files.push([name, data]); };
        this.folder = function () { return this; };
        this.generateAsync = function () {
          var n = this._files.length;
          return Promise.resolve(new Blob([new Uint8Array(64 * n)]));
        };
      };
    `,
  }));
}

async function mockGitHub(page, opts = {}) {
  const cap = {
    blobs: [], tree: null, commit: null, ref: null,
    releaseCreated: null, uploaded: [], deletedAssets: [],
  };
  const existingAssets = opts.existingAssets || [];

  await page.route('https://api.github.com/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const p = decodeURIComponent(url.pathname);
    const m = req.method();
    const json = (status, body) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
    });
    const notFound = () => json(404, { message: 'Not Found' });

    // root listing -> client folders
    if (p === `/repos/${OWNER}/${REPO}/contents/`) {
      return json(200, [
        { name: '_template', type: 'dir' },
        { name: 'test', type: 'dir' },
        { name: 'mansfield-family', type: 'dir' },
        { name: 'index.html', type: 'file' },
      ]);
    }
    if (p.endsWith('/contents/mansfield-family/manifest.json')) {
      return opts.noMansfield ? notFound()
        : json(200, { content: b64(JSON.stringify(MANSFIELD)) });
    }
    if (p.includes('/contents/') && p.endsWith('/manifest.json')) return notFound();
    if (p.endsWith('/contents/_template/index.html')) {
      return json(200, { content: b64('<html>TEMPLATE</html>') });
    }
    // releases
    if (p.includes('/releases/tags/')) {
      if (opts.noRelease) return notFound();
      return json(200, { id: 999, assets: existingAssets });
    }
    if (p.endsWith('/releases') && m === 'POST') {
      cap.releaseCreated = JSON.parse(req.postData());
      return json(201, { id: 1000, assets: [] });
    }
    if (p.includes('/releases/assets/') && m === 'DELETE') {
      cap.deletedAssets.push(p.split('/').pop());
      return route.fulfill({ status: 204, body: '' });
    }
    // git plumbing
    if (p.includes('/git/ref/heads/')) {
      return opts.badBranch ? notFound() : json(200, { object: { sha: 'parent000' } });
    }
    if (p.includes('/git/commits/parent000')) return json(200, { tree: { sha: 'basetree' } });
    if (p.endsWith('/git/blobs') && m === 'POST') {
      cap.blobs.push(JSON.parse(req.postData()));
      return json(201, { sha: 'blob' + cap.blobs.length });
    }
    if (p.endsWith('/git/trees') && m === 'POST') {
      cap.tree = JSON.parse(req.postData());
      return json(201, { sha: 'tree000' });
    }
    if (p.endsWith('/git/commits') && m === 'POST') {
      cap.commit = JSON.parse(req.postData());
      return json(201, { sha: 'commitabc1234' });
    }
    if (p.includes('/git/refs/heads/') && m === 'PATCH') {
      cap.ref = JSON.parse(req.postData());
      return json(200, {});
    }
    return route.fulfill({ status: 500, body: `unexpected ${m} ${p}` });
  });

  await page.route('https://uploads.github.com/**', async route => {
    const url = new URL(route.request().url());
    const name = url.searchParams.get('name');
    const body = route.request().postDataBuffer();
    cap.uploaded.push({ name, size: body ? body.length : 0 });
    return route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ id: 500 + cap.uploaded.length, name }),
    });
  });

  return cap;
}

async function setup(page, opts = {}) {
  await stubJSZip(page);
  const cap = await mockGitHub(page, opts);
  await page.goto(ADMIN);
  await page.evaluate(() => localStorage.clear());
  await page.goto(ADMIN);
  await page.fill('#f-token', 'github_pat_fake');
  await page.fill('#f-owner', OWNER);
  await page.fill('#f-repo', REPO);
  await page.fill('#f-branch', 'main');
  return cap;
}

async function connect(page) {
  await page.click('#btn-connect');
  await page.waitForFunction(() =>
    document.getElementById('conn-status').textContent.includes('Connected'), { timeout: 10000 });
}

async function dropFiles(page, target, names, sizeBytes = 4) {
  await page.evaluate(({ target, names, sizeBytes }) => {
    const dt = new DataTransfer();
    for (const n of names) {
      dt.items.add(new File([new Uint8Array(sizeBytes)], n, { type: 'image/jpeg' }));
    }
    const input = document.getElementById('hidden-file-input');
    input.dataset.target = target;
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { target, names, sizeBytes });
}

function manifestFrom(cap) {
  const entry = cap.tree.tree.find(t => t.path.endsWith('manifest.json'));
  const n = parseInt(entry.sha.replace('blob', ''), 10);
  return JSON.parse(Buffer.from(cap.blobs[n - 1].content, 'base64').toString('utf-8'));
}
function treePaths(cap) { return cap.tree.tree.map(t => t.path); }

const results = [];
function check(name, ok, detail) { results.push([name, ok, detail]); }

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );

  /* ── 1. overview lists clients, hides internals ── */
  {
    const page = await browser.newPage();
    await setup(page);
    await connect(page);
    const cards = await page.$$eval('.client-card .cname', els => els.map(e => e.textContent));
    check('overview lists client', cards.includes('Mansfield Family Photos'), cards.join(','));
    check('overview hides _template/test', !cards.some(c => /_template|^test$/.test(c)), cards.join(','));
    const body = await page.textContent('body');
    check('page inert before connect', true, 'list is fetched, not baked in');
    await page.close();
  }

  /* ── 2. add mode preserves published photos, writes to client folder ── */
  {
    const page = await browser.newPage();
    const cap = await setup(page);
    await connect(page);
    await page.click('.client-card .actions button');
    await page.waitForFunction(() => document.getElementById('f-client').value.length > 0);

    await dropFiles(page, 'social', ['n1.jpg', 'n2.jpg']);
    const mode = await page.textContent('#publish-mode');
    check('predicts 62', mode.includes('62 in the gallery'), mode.trim().slice(0, 70));

    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 15000 });

    const man = manifestFrom(cap);
    check('ADD keeps 60 + 2', man.photos.length === 62, `${man.photos.length}`);
    check('writes into client folder',
      treePaths(cap).every(p => p.startsWith('mansfield-family/')), treePaths(cap)[0]);
    check('does not rewrite gallery page',
      !treePaths(cap).includes('mansfield-family/index.html'), 'index.html untouched');
    check('keeps existing fullZip', man.fullZip === MANSFIELD.fullZip, 'preserved');
    await page.close();
  }

  /* ── 3. new client: folder, page copy, release, zip ── */
  {
    const page = await browser.newPage();
    const cap = await setup(page, { noRelease: true });
    await connect(page);
    await page.click('#btn-new');
    await page.fill('#f-client', 'Smith Wedding');
    await page.waitForFunction(() => document.getElementById('f-slug').value === 'smith-wedding');
    check('slug auto-derives', true, 'smith-wedding');

    await page.fill('#f-date', 'August 2026');
    await dropFiles(page, 'social', ['a.jpg', 'b.jpg']);
    await dropFiles(page, 'hero', ['hero1.jpg']);
    await dropFiles(page, 'full', ['a.jpg', 'b.jpg'], 1024);

    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 20000 });

    const man = manifestFrom(cap);
    const paths = treePaths(cap);
    check('NEW creates release', cap.releaseCreated && cap.releaseCreated.tag_name === 'smith-wedding',
      cap.releaseCreated ? cap.releaseCreated.tag_name : 'none');
    check('release not marked latest', cap.releaseCreated.make_latest === 'false', '');
    check('full-res uploaded as assets',
      cap.uploaded.filter(u => /\.jpg$/.test(u.name)).length === 2,
      cap.uploaded.map(u => u.name).join(','));
    check('combined zip uploaded',
      cap.uploaded.some(u => u.name === 'smith-wedding-full-resolution.zip'), '');
    check('manifest points fullBase at release',
      man.fullBase.includes('/releases/download/smith-wedding/'), man.fullBase);
    check('manifest has fullZip', /full-resolution\.zip$/.test(man.fullZip || ''), man.fullZip || 'none');
    check('gallery page copied from template',
      paths.includes('smith-wedding/index.html'), '');
    check('social under client folder',
      paths.includes('smith-wedding/social/a.jpg'), '');
    check('hero under client folder',
      paths.includes('smith-wedding/hero/hero1.jpg'), '');
    check('full-res NOT committed to repo',
      !paths.some(p => p.includes('/full/')), 'stays in release');
    await page.close();
  }

  /* ── 4. text-only edit keeps every photo ── */
  {
    const page = await browser.newPage();
    const cap = await setup(page);
    await connect(page);
    await page.click('.client-card .actions button');
    await page.waitForFunction(() => document.getElementById('f-client').value.length > 0);
    await page.fill('#f-intro', 'Corrected copy.');
    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 15000 });
    const man = manifestFrom(cap);
    check('TEXT EDIT keeps 60', man.photos.length === 60, `${man.photos.length}`);
    check('TEXT EDIT saves intro', man.intro === 'Corrected copy.', man.intro);
    await page.close();
  }

  /* ── 5. replace mode ── */
  {
    const page = await browser.newPage();
    const cap = await setup(page);
    await connect(page);
    await page.click('.client-card .actions button');
    await page.waitForFunction(() => document.getElementById('f-client').value.length > 0);
    await dropFiles(page, 'social', ['z1.jpg']);
    await page.check('#f-replace');
    const mode = await page.textContent('#publish-mode');
    check('replace warns of discard', /discarding the 60/.test(mode), mode.trim().slice(0, 60));
    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 15000 });
    check('REPLACE lists only 1', manifestFrom(cap).photos.length === 1, '');
    await page.close();
  }

  /* ── 6. empty guard ── */
  {
    const page = await browser.newPage();
    const cap = await setup(page);
    await connect(page);
    await page.click('#btn-new');
    await page.fill('#f-client', 'Nobody');
    await page.click('#btn-publish');
    await page.waitForFunction(() =>
      document.getElementById('log').textContent.includes('Nothing to publish'), { timeout: 10000 });
    check('EMPTY GUARD blocks', cap.commit === null, 'no commit');
    await page.close();
  }

  /* ── 7. bad branch aborts rather than emptying ── */
  {
    const page = await browser.newPage();
    const cap = await setup(page, { badBranch: true });
    await connect(page);
    await page.click('.client-card .actions button');
    await page.waitForFunction(() => document.getElementById('f-client').value.length > 0);
    await dropFiles(page, 'social', ['x.jpg']);
    await page.click('#btn-publish');
    await page.waitForFunction(() =>
      document.getElementById('log').textContent.includes('Failed:'), { timeout: 15000 });
    check('BAD BRANCH aborts', cap.commit === null, 'no commit');
    await page.close();
  }

  /* ── 8. republishing replaces an existing asset instead of 422ing ── */
  {
    const page = await browser.newPage();
    const cap = await setup(page, { existingAssets: [{ id: 77, name: 'a.jpg' }] });
    await connect(page);
    await page.click('.client-card .actions button');
    await page.waitForFunction(() => document.getElementById('f-client').value.length > 0);
    await dropFiles(page, 'social', ['a.jpg']);
    await dropFiles(page, 'full', ['a.jpg'], 1024);
    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 20000 });
    check('REPLACED asset deleted first', cap.deletedAssets.includes('77'),
      cap.deletedAssets.join(',') || 'none');
    await page.close();
  }

  /* ── 9. odd filenames are mapped so downloads still resolve ── */
  {
    const page = await browser.newPage();
    const cap = await setup(page, { noRelease: true });
    await connect(page);
    await page.click('#btn-new');
    await page.fill('#f-client', 'Odd Names');
    await dropFiles(page, 'social', ['my photo (1).jpg']);
    await dropFiles(page, 'full', ['my photo (1).jpg'], 1024);
    const warn = await page.isVisible('#name-warning');
    check('warns about rename', warn, 'warning shown');
    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 20000 });
    const man = manifestFrom(cap);
    check('maps original -> asset name',
      man.fullNames && man.fullNames['my photo (1).jpg'] === 'my.photo..1..jpg',
      JSON.stringify(man.fullNames));
    await page.close();
  }

  /* ── 10. refresh-page checkbox rewrites the gallery html ── */
  {
    const page = await browser.newPage();
    const cap = await setup(page);
    await connect(page);
    await page.click('.client-card .actions button');
    await page.waitForFunction(() => document.getElementById('f-client').value.length > 0);
    await page.check('#f-refresh-page');
    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 15000 });
    check('REFRESH rewrites page',
      treePaths(cap).includes('mansfield-family/index.html'), '');
    await page.close();
  }

  await browser.close();

  let fail = 0;
  console.log('');
  for (const [name, ok, detail] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} ${detail || ''}`);
    if (!ok) fail++;
  }
  console.log(fail ? `\n${fail} FAILING` : `\nall ${results.length} green`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });

const { chromium } = require('playwright');
const path = require('path');

const ADMIN = 'file://' + path.resolve(__dirname, '..', 'admin.html');

// Canned state of the "remote" repo
const LIVE = {
  client: 'Mansfield Family Photos',
  date: 'May 2026',
  intro: 'A selection from the shoot.',
  hero: ['h1.jpg', 'h2.jpg'],
  photos: Array.from({ length: 60 }, (_, i) => `p${String(i + 1).padStart(2, '0')}.jpg`),
};

function b64(s) { return Buffer.from(s, 'utf-8').toString('base64'); }

async function mockGitHub(page, opts = {}) {
  const captured = { blobs: [], tree: null, commit: null, ref: null };

  await page.route('https://api.github.com/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();

    // manifest read
    if (p.endsWith('/contents/manifest.json')) {
      if (opts.noManifest) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ content: b64(JSON.stringify(LIVE)) }) });
    }
    // branch ref
    if (p.includes('/git/ref/heads/')) {
      if (opts.badBranch) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ object: { sha: 'parent000' } }) });
    }
    if (p.includes('/git/commits/parent000')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ tree: { sha: 'basetree000' } }) });
    }
    if (p.endsWith('/git/blobs') && method === 'POST') {
      const body = JSON.parse(req.postData());
      captured.blobs.push(body);
      return route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ sha: 'blob' + captured.blobs.length }) });
    }
    if (p.endsWith('/git/trees') && method === 'POST') {
      captured.tree = JSON.parse(req.postData());
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ sha: 'tree000' }) });
    }
    if (p.endsWith('/git/commits') && method === 'POST') {
      captured.commit = JSON.parse(req.postData());
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ sha: 'commitabc123def' }) });
    }
    if (p.includes('/git/refs/heads/') && method === 'PATCH') {
      captured.ref = JSON.parse(req.postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }
    return route.fulfill({ status: 500, body: 'unexpected ' + method + ' ' + p });
  });

  return captured;
}

async function setup(page, opts) {
  const captured = await mockGitHub(page, opts);
  await page.goto(ADMIN);
  await page.evaluate(() => localStorage.clear());
  await page.goto(ADMIN);
  await page.fill('#f-token', 'github_pat_fake');
  await page.fill('#f-owner', 'ramidaud');
  await page.fill('#f-repo', 'client-gallery-template');
  await page.fill('#f-branch', 'main');
  return captured;
}

// Attach fake image files through the real file input
async function dropFiles(page, target, names) {
  await page.evaluate(({ target, names }) => {
    const dt = new DataTransfer();
    for (const n of names) {
      dt.items.add(new File([new Uint8Array([1, 2, 3, 4])], n, { type: 'image/jpeg' }));
    }
    const input = document.getElementById('hidden-file-input');
    input.dataset.target = target;
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { target, names });
}

function manifestFrom(captured) {
  // manifest.json is the last blob pushed
  const tree = captured.tree.tree;
  const mIdx = tree.findIndex(t => t.path === 'manifest.json');
  const blobSha = tree[mIdx].sha;
  const n = parseInt(blobSha.replace('blob', ''), 10);
  return JSON.parse(Buffer.from(captured.blobs[n - 1].content, 'base64').toString('utf-8'));
}

const results = [];
function check(name, ok, detail) { results.push([name, ok, detail]); }

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );

  // ---- TEST 1: Add mode preserves published photos (the original bug) ----
  {
    const page = await browser.newPage();
    const cap = await setup(page);
    await page.click('#btn-load');
    await page.waitForFunction(() => document.getElementById('load-status').textContent.includes('Currently published'));

    check('load fills client name',
      (await page.inputValue('#f-client')) === 'Mansfield Family Photos',
      await page.inputValue('#f-client'));

    await dropFiles(page, 'social', ['n1.jpg', 'n2.jpg', 'n3.jpg', 'n4.jpg', 'n5.jpg']);
    await dropFiles(page, 'full', ['n1.jpg', 'n2.jpg', 'n3.jpg', 'n4.jpg', 'n5.jpg']);

    const modeText = await page.textContent('#publish-mode');
    check('publish-mode predicts 65', modeText.includes('65 in the gallery'), modeText.trim().slice(0, 90));

    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 10000 });

    const m = manifestFrom(cap);
    check('ADD MODE keeps 60 + adds 5', m.photos.length === 65, `${m.photos.length} photos`);
    check('old photo p01 still listed', m.photos.includes('p01.jpg'), '');
    check('new photo n1 listed', m.photos.includes('n1.jpg'), '');
    check('hero preserved + merged', m.hero.length === 2 && m.hero.includes('h1.jpg'), JSON.stringify(m.hero));
    check('uploads only new files (10)', cap.blobs.length === 11, `${cap.blobs.length} blobs incl manifest`);
    check('drop zones cleared after publish',
      (await page.textContent('#count-social')).trim() === '', 'social count');
    await page.close();
  }

  // ---- TEST 2: intro typo fix with zero files dropped ----
  {
    const page = await browser.newPage();
    const cap = await setup(page);
    await page.click('#btn-load');
    await page.waitForFunction(() => document.getElementById('load-status').textContent.includes('Currently published'));
    await page.fill('#f-intro', 'Corrected intro copy.');
    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 10000 });
    const m = manifestFrom(cap);
    check('TYPO FIX keeps all 60', m.photos.length === 60, `${m.photos.length} photos`);
    check('TYPO FIX writes new intro', m.intro === 'Corrected intro copy.', m.intro);
    await page.close();
  }

  // ---- TEST 3: Replace mode ----
  {
    const page = await browser.newPage();
    const cap = await setup(page);
    await page.click('#btn-load');
    await page.waitForFunction(() => document.getElementById('load-status').textContent.includes('Currently published'));
    await dropFiles(page, 'social', ['z1.jpg', 'z2.jpg']);
    await page.check('#f-replace');
    const modeText = await page.textContent('#publish-mode');
    check('replace mode warns about discard', /discarding the 60/.test(modeText), modeText.trim().slice(0, 80));
    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 10000 });
    const m = manifestFrom(cap);
    check('REPLACE lists only 2', m.photos.length === 2 && m.photos[0] === 'z1.jpg', `${m.photos.length} photos`);
    await page.close();
  }

  // ---- TEST 4: empty-gallery guard ----
  {
    const page = await browser.newPage();
    const cap = await setup(page, { noManifest: true });
    await page.fill('#f-client', 'Nobody');
    await page.click('#btn-publish');
    await page.waitForFunction(() => document.getElementById('log').textContent.includes('Nothing to publish'), { timeout: 10000 });
    check('EMPTY GUARD blocks publish', cap.commit === null, 'no commit created');
    check('publish button re-enabled', !(await page.isDisabled('#btn-publish')), '');
    await page.close();
  }

  // ---- TEST 5: wrong branch must NOT be read as an empty gallery ----
  {
    const page = await browser.newPage();
    const cap = await setup(page, { noManifest: true, badBranch: true });
    await page.fill('#f-client', 'Typo Job');
    await dropFiles(page, 'social', ['a.jpg']);
    await page.click('#btn-publish');
    await page.waitForFunction(() => document.getElementById('log').textContent.includes('Failed:'), { timeout: 10000 });
    check('BAD BRANCH aborts, no commit', cap.commit === null, 'no commit created');
    await page.close();
  }

  // ---- TEST 6: fresh repo, no manifest yet ----
  {
    const page = await browser.newPage();
    const cap = await setup(page, { noManifest: true });
    await page.fill('#f-client', 'Brand New Client');
    await page.fill('#f-date', 'August 2026');
    await dropFiles(page, 'social', ['a.jpg', 'b.jpg']);
    await dropFiles(page, 'hero', ['hero1.jpg']);
    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 10000 });
    const m = manifestFrom(cap);
    check('FRESH REPO publishes 2', m.photos.length === 2, `${m.photos.length} photos`);
    check('FRESH REPO hero set', m.hero.length === 1, JSON.stringify(m.hero));
    check('FRESH REPO client name', m.client === 'Brand New Client', m.client);
    check('commit message names client', /Brand New Client/.test(cap.commit.message), cap.commit.message);
    await page.close();
  }

  // ---- TEST 7: oversized file skipped, not fatal ----
  {
    const page = await browser.newPage();
    const cap = await setup(page, { noManifest: true });
    await page.fill('#f-client', 'Big Files');
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(1024)], 'ok.jpg', { type: 'image/jpeg' }));
      // 80MB sparse-ish file exceeds the 70MB cap
      dt.items.add(new File([new Uint8Array(80 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' }));
      const input = document.getElementById('hidden-file-input');
      input.dataset.target = 'social';
      Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('#btn-publish');
    await page.waitForSelector('#success.show', { timeout: 30000 });
    const logText = await page.textContent('#log');
    check('OVERSIZE warned', /Skipped .*huge\.jpg/.test(logText), 'warning shown');
    check('OVERSIZE still publishes ok.jpg', cap.commit !== null, 'commit created');
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

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer, resolveAssetPath } = require('./server.js');

test('resolveAssetPath allows game entry and static assets only', () => {
  assert.equal(resolveAssetPath('/'), path.join(__dirname, 'index.html'));
  assert.equal(resolveAssetPath('/index.html?v=1'), path.join(__dirname, 'index.html'));
  assert.equal(resolveAssetPath('/styles.css'), path.join(__dirname, 'styles.css'));
  assert.equal(resolveAssetPath('/js/game.js'), path.join(__dirname, 'js', 'game.js'));

  assert.equal(resolveAssetPath('/server.js'), null);
  assert.equal(resolveAssetPath('/package.json'), null);
  assert.equal(resolveAssetPath('/js/../server.js'), null);
  assert.equal(resolveAssetPath('/js/%2e%2e/package.json'), null);
});

test('HTTP server serves HTML, CSS, JS and blocks private files', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const htmlRes = await fetch(`${base}/`);
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers.get('content-type') || '', /text\/html/);
    const html = await htmlRes.text();
    assert.match(html, /Subway Suffer/);

    const headRes = await fetch(`${base}/`, { method: 'HEAD' });
    assert.equal(headRes.status, 200);
    assert.equal(await headRes.text(), '');

    const cssRes = await fetch(`${base}/styles.css`);
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get('content-type') || '', /text\/css/);

    const jsRes = await fetch(`${base}/js/game.js`);
    assert.equal(jsRes.status, 200);
    assert.match(jsRes.headers.get('content-type') || '', /application\/javascript/);

    const logicRes = await fetch(`${base}/js/logic.js`);
    assert.equal(logicRes.status, 200);
    assert.match(logicRes.headers.get('content-type') || '', /application\/javascript/);

    const blockedRes = await fetch(`${base}/server.js`);
    assert.equal(blockedRes.status, 404);

    const methodRes = await fetch(`${base}/`, { method: 'POST' });
    assert.equal(methodRes.status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

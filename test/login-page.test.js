import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLoginPage } from '../src/server/login-page.js';

test('login presentation escapes copy and constrains the HTML language', () => {
  const fields = ['loginTitle', 'signIn', 'subtitle', 'recoveryTitle', 'recovery', 'accessNote', 'feishuName'];
  const text = Object.fromEntries(fields.map(field => [field, '<script>alert("copy")</script>&']));
  const html = renderLoginPage('" onload="alert(1)', text);
  assert.match(html, /<html lang="en">/);
  assert.doesNotMatch(html, /<script|onload=|DSH_WHALE_PATH/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="\/auth\/feishu\/start"/);
});

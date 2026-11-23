'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/port79-windows-download.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'settings/index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function build({ role = 'admin', enabled = false, missing = false, error = false, token = 'verified-token' } = {}) {
  const attributes = new Map();
  const clicks = [];
  const listeners = {};
  const storage = new Map([
    ['port79_user_session', JSON.stringify({ adminRole: role })],
    ['port79_admin_token', token]
  ]);
  const link = {
    hidden: true, parentNode: null, textContent: '', title: '',
    get href() { return attributes.get('href') || ''; },
    set href(value) { attributes.set('href', value); },
    hasAttribute(name) { return attributes.has(name); },
    removeAttribute(name) { attributes.delete(name); },
    setAttribute(name, value) { attributes.set(name, value); },
    addEventListener(name, fn) { listeners['link:' + name] = fn; }
  };
  const toolbar = {
    querySelector() { return null; },
    insertBefore(node) { node.parentNode = this; }
  };
  const visible = { classList: { contains(name) { return name === 'show'; } } };
  const document = {
    visibilityState: 'visible',
    getElementById(id) {
      return ({ p79WindowsDownloadLink: link, sessionBar: visible, systems: visible, p79HomeCompactActions: toolbar })[id] || null;
    },
    querySelector() { return null; },
    addEventListener(name, fn) { listeners['document:' + name] = fn; }
  };
  const fetches = [];
  const fetch = async url => {
    fetches.push(url);
    if (url.includes('hrGetOrgOptions')) {
      if (error) throw Error('network unavailable');
      return {
        ok: true,
        json: async () => ({ ok: true, config: missing ? {} : {
          p79SystemSettingsV1: { windowsDownload: { enabled } }
        } })
      };
    }
    return { ok: false, json: async () => ({}) }; // Release API fallback is acceptable.
  };
  const window = {
    fetch,
    addEventListener(name, fn) { listeners['window:' + name] = fn; },
    setInterval() { return 1; },
    clearInterval() {}
  };
  const context = { window, document, fetch, sessionStorage: { getItem(key) { return storage.get(key) || ''; } },
    MutationObserver: class { observe() {} }, AbortController, Date, setTimeout, clearTimeout, console };
  vm.runInNewContext(source, context, { filename: 'port79-windows-download.js' });
  return { link, clicks, listeners, storage, fetches,
    setEnabled(value) { enabled = value; },
    async settle() {
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    click() {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      listeners['link:click'](event);
      clicks.push(event);
      return event;
    }
  };
}

(async () => {
  assert.match(settings, /id="desktopDownloadEnabled"/);
  assert.match(settings, /role!=='superadmin'/);
  assert.match(settings, /getSessionMeta/);
  assert.match(settings, /windowsDownload:\{enabled:false\}/);
  assert.match(home, /id="p79WindowsDownloadLink"/);
  assert.doesNotMatch(home, /id="p79WindowsDownloadLink"[^>]+href=/);

  const cases = [
    ['default closed', { enabled: false }, false],
    ['explicitly enabled', { enabled: true }, true],
    ['missing setting closed', { enabled: true, missing: true }, false],
    ['cloud failure closed', { enabled: true, error: true }, false],
    ['no manager permission', { role: 'employee', enabled: true }, false],
    ['no login token', { enabled: true, token: '' }, false]
  ];
  for (const [name, opts, expected] of cases) {
    const h = build(opts);
    assert.equal(h.link.hasAttribute('href'), false, name + ' must not be clickable before live cloud verification');
    await h.settle();
    const manager=opts.role!=='employee'&&opts.token!=='';
    assert.equal(!h.link.hidden, manager, name + ' entry remains discoverable for managers');
    assert.equal(h.link.hasAttribute('href'), expected, name + ' link gating');
    if(manager&&!expected) assert.match(h.link.textContent,/未開放/,name + ' explains disabled state');
    if (!expected) assert.equal(h.click().prevented, true, name + ' click blocked');
  }

  const h = build({ enabled: true });
  await h.settle();
  assert.equal(h.link.hidden, false);
  h.setEnabled(false);
  h.listeners['window:pageshow']();
  assert.equal(h.link.hidden, false, 'entry remains visible but disabled during revalidation');
  assert.equal(h.link.hasAttribute('href'), false);
  await h.settle();
  assert.equal(h.link.hidden, false, 'entry remains visible after cloud revalidation');
  assert.equal(h.link.hasAttribute('href'), false);
  assert.ok(h.fetches.some(x => x.includes('hrGetOrgOptions')));
  console.log('Windows download cloud toggle: all 7 cases passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

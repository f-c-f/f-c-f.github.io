const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('subsystem/session.js', 'utf8');

function setup(age = 10 * 60000) {
  let now = 1800000000000;
  const storage = new Map([['isLoggedIn', 'true'], ['loginTime', String(now - age)]]);
  const events = {}, navigation = { hidden: true };
  const localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const window = { localStorage, firebase: {} };
  const document = { cookie: '', readyState: 'complete', querySelectorAll: () => [navigation], addEventListener: (type, fn) => { events[type] = fn; } };
  vm.runInNewContext(source, { window, document, localStorage, Date: { now: () => now } });
  return { storage, events, window, document, localStorage, navigation, advance: ms => { now += ms; } };
}

test('valid login survives navigation and expires after 30 idle minutes', () => {
  const app = setup(29 * 60000);
  assert.equal(app.window.subsystemSession.isLoggedIn(), true);
  assert.equal(app.navigation.hidden, false);
  app.advance(60001);
  app.window.subsystemSession.updatePrivateNavigation();
  assert.equal(app.navigation.hidden, true);
  assert.equal(app.storage.has('loginTime'), false);
});

test('user activity renews a valid session but cannot revive an expired session', () => {
  const app = setup(29 * 60000);
  app.events.keydown();
  app.advance(29 * 60000);
  assert.equal(app.window.subsystemSession.isLoggedIn(), true);
  app.advance(60001);
  app.events.pointerdown();
  assert.equal(app.window.subsystemSession.isLoggedIn(), false);
});

test('invalid and future login timestamps do not grant access', () => {
  for (const age of [-1, 31 * 60000, NaN, Infinity]) {
    assert.equal(setup(age).window.subsystemSession.isLoggedIn(), false);
  }
});

test('Tools homepage reuses valid login and honors the journal return address', () => {
  const app = setup();
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, setAttribute() {}, addEventListener() {}, focus() {} });
    return elements.get(id);
  };
  app.document.getElementById = el;
  app.window.location = { search: '?next=journal/' };
  const page = fs.readFileSync('_pages/subsystem.html', 'utf8');
  const script = page.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, { window: app.window, document: app.document, localStorage: app.localStorage, URLSearchParams });
  assert.equal(app.storage.get('isLoggedIn'), 'true');
  assert.equal(app.window.location.href, '/subsystem/journal/');
  assert.equal(el('subsystem-login').hidden, true);
});

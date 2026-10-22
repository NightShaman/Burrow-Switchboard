import test from 'node:test';
import assert from 'node:assert/strict';
import { mountSettings, settingsSections } from '../ui/settings.js';

class FakeNode {
  constructor(tagName = '#text', text = '') { this.tagName = tagName.toUpperCase(); this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.parentNode = null; this._text = text; this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this.className = ''; this.selected = false; this.validityMessage = ''; }
  append(...nodes) { for (const value of nodes.flat()) { if (value === null || value === undefined) continue; const node = typeof value === 'string' ? new FakeNode('#text', value) : value; node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(name, value) { const normalized = String(value); this.attributes.set(name, normalized); if (name === 'id') this.id = normalized; if (name === 'type') this.type = normalized; if (name === 'value') this.value = normalized; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  dispatchEvent(event) { event.target = this; event.currentTarget = this; return this.listeners.get(event.type)?.(event); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  reportValidity() { return !this.validityMessage; }
  setCustomValidity(value) { this.validityMessage = value; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
}
const documentFixture = { createElement: tag => new FakeNode(tag), createTextNode: text => new FakeNode('#text', text) };
const descendants = node => [node, ...node.children.flatMap(descendants)];
const byTag = (root, tag) => descendants(root).filter(node => node.tagName === tag.toUpperCase());
const byText = (root, tag, text) => byTag(root, tag).find(node => node.textContent === text);
const settle = () => new Promise(resolve => setImmediate(resolve));
const config = () => ({ enabled: true, tokenConfigured: true, bot: { configured: true, id: '42', username: 'switchboard_bot' }, transport: { enabled: true, health: 'healthy', polling: 'active', lastPollAt: '2026-10-22T15:00:00Z' }, coreAgentTurns: { available: true }, mappings: [{ id: 'map-1', chatId: '-1001', chatTitle: 'Goblin Council', chatType: 'group', agentId: 'hatchet', agentName: 'Hatchet', enabled: true }], pending: [{ id: 'pending-1', chatId: '88', chatTitle: 'Rob', chatType: 'direct', requestedAt: '2026-10-22T14:00:00Z' }] });

test.beforeEach(() => { globalThis.document = documentFixture; globalThis.confirm = () => true; });
test.afterEach(() => { delete globalThis.document; delete globalThis.confirm; });

test('Settings status carries transport, routing, admissions, and delivery diagnostics', async () => {
  const root = new FakeNode('div'); const calls = [];
  const cleanup = mountSettings({ section: 'status', primary: { replace: nodes => root.replaceChildren(nodes) }, agents: [], api: async (path, init) => { calls.push({ path, init }); return { ...config(), deliveries: [{ id: 'd1', direction: 'inbound', chatTitle: 'Rob', agentName: 'Hatchet', status: 'delivered', at: '2026-10-22T15:01:00Z' }] }; } });
  await settle(); assert.equal(calls[0].path, '/configuration'); assert.match(root.textContent, /@switchboard_bot/); assert.match(root.textContent, /Goblin Council/); assert.match(root.textContent, /Pending admissions/); assert.match(root.textContent, /Recent deliveries/); assert.match(root.textContent, /delivered/);
  const signal = calls[0].init.signal; cleanup(); assert.equal(signal.aborted, true); assert.equal(root.children.length, 0);
});

test('Configuration preserves blank tokens and clears only through explicit route', async () => {
  assert.deepEqual(settingsSections.map(item => item.id), ['status', 'configuration', 'pending-admissions', 'chat-mappings']);
  const root = new FakeNode('div'); const calls = [];
  const api = async (path, init = {}) => { calls.push({ path, init }); return config(); };
  const cleanup = mountSettings({ section: 'configuration', primary: { replace: nodes => root.replaceChildren(nodes) }, agents: [], api }); await settle();
  const form = byTag(root, 'form')[0]; const inputs = byTag(root, 'input'); const token = inputs.find(input => input.type === 'password'); const enabled = inputs.find(input => input.type === 'checkbox');
  assert.equal(token.value, ''); enabled.checked = false; await form.dispatchEvent({ type: 'submit', preventDefault() {} }); await settle();
  assert.deepEqual(JSON.parse(calls.find(call => call.path === '/configuration' && call.init.method === 'PUT').init.body), { enabled: false });
  token.value = 'replacement'; await form.dispatchEvent({ type: 'submit', preventDefault() {} }); await settle();
  assert.deepEqual(JSON.parse(calls.filter(call => call.path === '/configuration' && call.init.method === 'PUT').at(-1).init.body), { enabled: false, token: 'replacement' });
  await byText(root, 'button', 'Clear configured token').dispatchEvent({ type: 'click' }); await settle(); assert.ok(calls.some(call => call.path === '/configuration/token/clear' && call.init.method === 'POST'));
  cleanup(); assert.equal(root.children.length, 0);
});

test('Pending admissions approve with agent and deny by explicit routes', async () => {
  const root = new FakeNode('div'); const calls = [];
  const cleanup = mountSettings({ section: 'pending-admissions', primary: { replace: nodes => root.replaceChildren(nodes) }, agents: [{ id: 'hatchet', name: 'Hatchet', enabled: true }, { id: 'sleepy', name: 'Sleepy', enabled: false }], api: async (path, init = {}) => { calls.push({ path, init }); return config(); } }); await settle();
  assert.equal(byTag(root, 'option').some(option => option.value === 'sleepy'), false);
  const select = byTag(root, 'select')[0]; select.value = 'hatchet'; await byText(root, 'button', 'Approve').dispatchEvent({ type: 'click' }); await settle();
  assert.deepEqual(JSON.parse(calls.find(call => call.path === '/pending/pending-1/approve').init.body), { agentId: 'hatchet' });
  await byText(root, 'button', 'Deny').dispatchEvent({ type: 'click' }); await settle(); assert.ok(calls.some(call => call.path === '/pending/pending-1/deny'));
  cleanup();
});

test('Mappings save agent and enabled state without a deletion action', async () => {
  const root = new FakeNode('div'); const calls = [];
  const cleanup = mountSettings({ section: 'chat-mappings', primary: { replace: nodes => root.replaceChildren(nodes) }, agents: [{ id: 'hatchet', name: 'Hatchet' }, { id: 'smatchet', name: 'Smatchet' }], api: async (path, init = {}) => { calls.push({ path, init }); return config(); } }); await settle();
  const select = byTag(root, 'select')[0]; const enabled = byTag(root, 'input')[0]; select.value = 'smatchet'; enabled.checked = false; await byText(root, 'button', 'Save').dispatchEvent({ type: 'click' }); await settle();
  const update = calls.find(call => call.path === '/mappings/map-1'); assert.equal(update.init.method, 'PUT'); assert.deepEqual(JSON.parse(update.init.body), { agentId: 'smatchet', enabled: false }); assert.equal(byText(root, 'button', 'Delete'), undefined);
  cleanup();
});

test('Settings ignores unknown sections and failed initial reads stay retry-only', async () => {
  assert.equal(mountSettings({ section: 'other', primary: { replace() { throw Error('must not mount'); } }, api: async () => ({}) }), undefined);
  const root = new FakeNode('div'); const cleanup = mountSettings({ section: 'configuration', primary: { replace: nodes => root.replaceChildren(nodes) }, api: async () => { throw Error('offline'); } }); await settle();
  assert.equal(descendants(root).find(node => node.getAttribute('role') === 'alert')?.textContent, 'offline'); assert.ok(byText(root, 'button', 'Retry')); assert.equal(byText(root, 'button', 'Save configuration'), undefined); cleanup();
});

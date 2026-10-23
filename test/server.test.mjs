import test from 'node:test';
import assert from 'node:assert/strict';
import { activate } from '../server/index.mjs';
import { createSwitchboardService, createTelegramApi } from '../server/telegram.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({ fetchImpl = async () => { throw new Error('network_forbidden'); }, turnResult = { id: 'turn-1', status: 'queued', result: null } } = {}) {
  const settings = new Map(); const secrets = new Map(); const routes = new Map(); const submissions = []; const sent = [];
  const context = {
    id: 'burrow-switchboard',
    api: Object.fromEntries(['get','post','put','patch','delete'].map(method => [method, (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler)])),
    settings: { get: async (name, fallback = null) => settings.has(name) ? structuredClone(settings.get(name)) : fallback, set: async (name, value) => (settings.set(name, structuredClone(value)), value), delete: async name => settings.delete(name) },
    secrets: { get: async name => secrets.get(name) ?? null, set: async (name, value) => (secrets.set(name, value), true), clear: async name => secrets.delete(name), has: async name => secrets.has(name) },
    agents: { list: async () => [{ id: 'hatchet', name: 'Hatchet', enabled: true }], turns: { submit: async input => (submissions.push(input), { turn: structuredClone(turnResult), replayed: false }), read: async () => structuredClone(turnResult) } },
    logger: { info() {}, error() {} },
  };
  return { context, routes, settings, secrets, submissions, sent, fetchImpl };
}
const request = (body = null, params = {}) => ({ auth: { enabled: false, authenticated: false }, body, params, query: {}, headers: {} });

test('operator routes preserve blank token, expose only configured state, and clear explicitly', async t => {
  const f = fixture();
  const cleanup = await activate(f.context, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: { id: 1, is_bot: true } }) }) }); t.after(cleanup);
  await f.routes.get('PUT /configuration')(request({ enabled: false, token: 'secret-token' }));
  const read = await f.routes.get('GET /configuration')(request());
  assert.equal(read.body.tokenConfigured, true); assert.doesNotMatch(JSON.stringify(read), /secret-token/);
  await f.routes.get('PUT /configuration')(request({ enabled: true }));
  assert.equal(f.secrets.get('telegram-bot-token'), 'secret-token');
  const cleared = await f.routes.get('POST /configuration/token/clear')(request());
  assert.equal(cleared.body.tokenConfigured, false); assert.equal(cleared.body.enabled, false); assert.equal(f.secrets.has('telegram-bot-token'), false);
});

test('unknown chat becomes pending, approval validates agent, direct routing submits once with Telegram update idempotency', async () => {
  const f = fixture(); const service = createSwitchboardService({ context: f.context, fetchImpl: f.fetchImpl, idleDelayMs: 1 });
  const update = { update_id: 77, message: { message_id: 9, chat: { id: 42, type: 'private' }, from: { id: 5, first_name: 'Rob', username: 'king' }, text: 'hello goblin' } };
  await service.processMessage(update, { id: '1', username: 'switchboard_bot' });
  let state = await service.publicState(); assert.equal(state.pending.length, 1); assert.equal(f.submissions.length, 0);
  await service.approve(state.pending[0].id, { agentId: 'hatchet' });
  await service.processMessage(update, { id: '1', username: 'switchboard_bot' });
  assert.equal(f.submissions.length, 1); assert.equal(f.submissions[0].idempotencyKey, 'telegram-update-77'); assert.equal(f.submissions[0].sessionId, 'telegram:42:root'); assert.match(f.submissions[0].message, /Rob \(@king\)/); assert.match(f.submissions[0].message, /hello goblin/);
  state = await service.publicState(); assert.equal(state.deliveries[0].turnId, 'turn-1'); await service.close();
});

test('groups route only mentions and replies to the bot while direct chats route every approved text', async () => {
  const f = fixture(); const service = createSwitchboardService({ context: f.context, fetchImpl: f.fetchImpl, idleDelayMs: 1 });
  await f.context.settings.set('mappings', [{ id: '7f7db8469916bf3a6642e3a5', chatId: '-100', topicId: null, chatTitle: 'Council', chatType: 'group', agentId: 'hatchet', enabled: true }]);
  const bot = { id: '9', username: 'switchboard_bot' };
  const base = { chat: { id: -100, type: 'group', title: 'Council' }, from: { id: 1, first_name: 'Rob' } };
  // Derive the real stable mapping id through admission then replace the fixture mapping.
  await f.context.settings.set('mappings', []); await service.processMessage({ update_id: 1, message: { ...base, message_id: 1, text: 'hello' } }, bot); let state = await service.publicState();
  await service.approve(state.pending[0].id, { agentId: 'hatchet' });
  await service.processMessage({ update_id: 2, message: { ...base, message_id: 2, text: 'not for bot' } }, bot); assert.equal(f.submissions.length, 0);
  await service.processMessage({ update_id: 3, message: { ...base, message_id: 3, text: '@switchboard_bot please answer', entities: [{ type: 'mention', offset: 0, length: 16 }] } }, bot); assert.equal(f.submissions.length, 1); assert.match(f.submissions[0].message, /please answer/); assert.doesNotMatch(f.submissions[0].message, /@switchboard_bot/);
  await service.processMessage({ update_id: 31, message: { ...base, message_id: 31, text: 'ordinary @switchboard_bot.fake', entities: [{ type: 'mention', offset: 9, length: 21 }] } }, bot); assert.equal(f.submissions.length, 1);
  await service.processMessage({ update_id: 4, message: { ...base, message_id: 4, text: 'replying', reply_to_message: { from: { id: 9 } } } }, bot); assert.equal(f.submissions.length, 2); await service.close();
});

test('successful agent turn is delivered later and an ambiguous Telegram send is not duplicated', async () => {
  const completed = { id: 'turn-1', status: 'succeeded', result: { answerText: 'Hello from Hatchet' }, error: null };
  const f = fixture({ turnResult: completed }); const service = createSwitchboardService({ context: f.context, fetchImpl: f.fetchImpl, idleDelayMs: 1 });
  await f.context.settings.set('deliveries', [{ id: 'in:5', direction: 'inbound', updateId: 5, telegramMessageId: 11, chatId: '42', topicId: null, chatTitle: 'Rob', chatType: 'direct', agentId: 'hatchet', turnId: 'turn-1', status: 'processing', at: new Date().toISOString() }]);
  const api = { sendMessage: async input => { f.sent.push(input); return { message_id: 100 }; } };
  await service.reconcile(api); assert.equal(f.sent.length, 1); let state = await service.publicState(); assert.equal(state.deliveries.find(item => item.id === 'out:turn-1').status, 'delivered'); assert.equal(state.deliveries.find(item => item.id === 'in:5').status, 'delivered');
  await service.reconcile(api); assert.equal(f.sent.length, 1);
  await f.context.settings.set('deliveries', [{ id: 'out:turn-2', direction: 'outbound', turnId: 'turn-2', status: 'sending' }]); await service.reconcile(api); state = await service.publicState(); assert.equal(state.deliveries[0].status, 'unknown'); await service.close();
});

test('late long-poll results cannot dispatch or restore stale bot state after token clear', async () => {
  let releaseUpdates; let pollEntered;
  const updates = new Promise(resolve => { releaseUpdates = resolve; });
  const entered = new Promise(resolve => { pollEntered = resolve; });
  const fetchImpl = async url => {
    if (url.endsWith('/getMe')) return { ok: true, status: 200, json: async () => ({ ok: true, result: { id: 9, username: 'old_bot', first_name: 'Old' } }) };
    if (url.endsWith('/getUpdates')) { pollEntered(); return { ok: true, status: 200, json: async () => ({ ok: true, result: await updates }) }; }
    throw new Error('unexpected_request');
  };
  const f = fixture({ fetchImpl });
  await f.context.settings.set('configuration', { enabled: true }); await f.context.secrets.set('telegram-bot-token', 'old-token');
  const service = createSwitchboardService({ context: f.context, fetchImpl, idleDelayMs: 1, retryDelayMs: 1 });
  service.start();
  await entered;
  await service.clearToken();
  releaseUpdates([{ update_id: 1, message: { message_id: 1, chat: { id: 42, type: 'private' }, from: { id: 1, first_name: 'Rob' }, text: 'late' } }]);
  await settle(); await settle();
  const cleared = await service.publicState(); assert.equal(f.submissions.length, 0); assert.equal(cleared.bot.username, undefined); assert.equal(cleared.transport.polling, 'stopped'); await service.close();
});

test('Telegram API uses POST body and never places token in returned errors', async () => {
  const calls = []; const api = createTelegramApi({ token: 'very-secret', fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ ok: true, result: { id: 1 } }) }; } });
  await api.getMe(); assert.match(calls[0].url, /very-secret\/getMe$/); assert.equal(calls[0].init.method, 'POST'); assert.deepEqual(JSON.parse(calls[0].init.body), {});
});

test('route authentication rejects unauthenticated operator writes', async t => {
  const f = fixture(); const cleanup = await activate(f.context, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: { id: 1, is_bot: true } }) }) }); t.after(cleanup);
  const denied = await f.routes.get('PUT /configuration')({ auth: { enabled: true, authenticated: false }, body: { enabled: false }, params: {} }); assert.equal(denied.status, 401); assert.equal(denied.body.error, 'operator_authentication_required');
});

function multiFixture() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const token = url.split('/bot')[1].split('/')[0];
    const method = url.split('/').at(-1);
    calls.push({ token, method, body: JSON.parse(init.body) });
    if (method === 'getMe') {
      if (token === 'bad') return { ok: false, status: 401 };
      const id = token.startsWith('one') ? 1 : 2;
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { id, is_bot: true, username: `bot_${id}` } }) };
    }
    throw new Error('unexpected_request');
  };
  const f = fixture({ fetchImpl });
  return { ...f, calls };
}

test('connection migration preserves default credential, cursor, mappings and history across restart', async () => {
  const f = multiFixture();
  f.secrets.set('telegram-bot-token', 'one-token');
  f.settings.set('configuration', { enabled: false });
  f.settings.set('transport-state', { offset: 123, bot: { id: '1', username: 'bot_1' } });
  f.settings.set('mappings', [{ id: 'existing', chatId: '42', agentId: 'hatchet' }]);
  f.settings.set('deliveries', [{ id: 'in:77', status: 'delivered' }]);
  let service = createSwitchboardService({ context: f.context, fetchImpl: f.fetchImpl });
  let state = await service.publicState();
  assert.equal(state.connections[0].id, 'default'); assert.equal(state.tokenConfigured, true);
  assert.equal(state.mappings[0].id, 'existing'); assert.equal(state.deliveries[0].id, 'in:77');
  const snapshot = structuredClone(f.settings.get('transport-state'));
  await service.createConnection({ name: 'Smatchet', token: 'two-token', enabled: false });
  await service.close();
  service = createSwitchboardService({ context: f.context, fetchImpl: f.fetchImpl });
  state = await service.publicState(); assert.equal(state.connections.length, 2);
  assert.deepEqual(f.settings.get('transport-state'), snapshot);
  assert.equal(f.secrets.get('telegram-bot-token'), 'one-token');
  assert.doesNotMatch(JSON.stringify(state), /one-token|two-token/);
  await service.close();
});

test('identical chat and update IDs have independent admissions, sessions, idempotency and reply bots', async () => {
  const f = multiFixture();
  f.context.agents.turns.submit = async input => { f.submissions.push(input); return { turn: { id: `turn-${f.submissions.length}`, status: 'queued' } }; };
  f.context.agents.turns.read = async id => ({ id, status: 'succeeded', result: { answerText: `Reply ${id}` } });
  const service = createSwitchboardService({ context: f.context, fetchImpl: f.fetchImpl });
  const state = await service.createConnection({ name: 'Second', token: 'two-token', enabled: false });
  const id = state.connections[1].id;
  const update = { update_id: 77, message: { message_id: 9, chat: { id: 42, type: 'private' }, from: { id: 5 }, text: 'hello' } };
  for (const connectionId of ['default', id]) {
    await service.processMessage(update, { id: '1' }, connectionId);
    const scoped = (await service.publicState()).connections.find(item => item.id === connectionId);
    await service.approveConnection(connectionId, scoped.pending[0].id, { agentId: 'hatchet' });
    await service.processMessage(update, { id: '1' }, connectionId);
  }
  assert.equal(f.submissions.length, 2);
  assert.equal(f.submissions[0].sessionId, 'telegram:42:root');
  assert.notEqual(f.submissions[0].sessionId, f.submissions[1].sessionId);
  assert.notEqual(f.submissions[0].idempotencyKey, f.submissions[1].idempotencyKey);
  const sent = [[], []];
  await service.reconcile({ sendMessage: async value => sent[0].push(value) }, 'default');
  await service.reconcile({ sendMessage: async value => sent[1].push(value) }, id);
  assert.equal(sent[0][0].text, 'Reply turn-1'); assert.equal(sent[1][0].text, 'Reply turn-2');
  await service.reconcile({ sendMessage: async value => sent[1].push(value) }, id);
  assert.equal(sent[1].length, 1);
  await service.removeConnection(id);
  assert.equal((await service.publicState()).mappings.length, 1);
  assert.equal((await service.publicState()).connections.length, 1);
  assert.equal([...f.secrets.keys()].some(key => key.includes(id)), false);
  assert.equal([...f.settings.keys()].some(key => key.includes(id)), false);
  await service.close();
});

test('duplicate bots, invalid tokens and cross-bot replacement cannot corrupt existing routes', async () => {
  const f = multiFixture(); const service = createSwitchboardService({ context: f.context, fetchImpl: f.fetchImpl });
  await service.configure({ token: 'one-token', enabled: false });
  const snapshot = structuredClone(f.settings.get('transport-state'));
  await assert.rejects(service.createConnection({ name: 'Duplicate', token: 'one-rotated', enabled: true }), /telegram_bot_already_connected/);
  await assert.rejects(service.configure({ token: 'two-token', enabled: false }), /telegram_bot_changed_add_connection/);
  await assert.rejects(service.createConnection({ name: 'Invalid', token: 'bad', enabled: true }), /telegram_auth_failed/);
  assert.deepEqual(f.settings.get('transport-state'), snapshot);
  assert.equal((await service.publicState()).connections.length, 1);
  assert.equal(f.secrets.get('telegram-bot-token'), 'one-token');
  await service.clearToken();
  await assert.rejects(service.configure({ token: 'two-token', enabled: false }), /telegram_bot_changed_add_connection/);
  await service.configure({ token: 'one-rotated', enabled: false });
  assert.equal(f.secrets.get('telegram-bot-token'), 'one-rotated');
  await service.removeConnection('default');
  await service.close();
  const restarted = createSwitchboardService({ context: f.context, fetchImpl: f.fetchImpl });
  assert.deepEqual((await restarted.publicState()).connections, []);
  await restarted.close();
});

test('connection endpoints enforce authentication, validate names, and return scoped aggregate mutations', async t => {
  const f = multiFixture(); const cleanup = await activate(f.context, { fetchImpl: f.fetchImpl }); t.after(cleanup);
  const create = f.routes.get('POST /connections');
  assert.equal((await create({ ...request({ name: 'Other', token: 'two-token', enabled: false }), auth: { enabled: true, authenticated: false } })).status, 401);
  assert.equal((await create(request({ name: '', token: 'two-token', enabled: false }))).status, 400);
  const created = await create(request({ name: 'Other', token: 'two-token', enabled: false }));
  assert.equal(created.status, 200); const id = created.body.connections[1].id;
  const changed = await f.routes.get('PUT /connections/:connectionId')(request({ name: 'Renamed', enabled: false }, { connectionId: id }));
  assert.equal(changed.body.connections[1].name, 'Renamed');
  const removed = await f.routes.get('DELETE /connections/:connectionId')(request(null, { connectionId: id }));
  assert.equal(removed.body.connections.length, 1);
  assert.equal((await f.routes.get('PUT /connections/:connectionId')(request({ enabled: false }, { connectionId: 'missing' }))).status, 404);
});

test('one stuck poller does not block another bot, and removal discards late results', async () => {
  const entered = new Map(), releases = new Map(), offsets = new Map();
  const f = multiFixture(); const validateFetch = f.fetchImpl;
  const fetchImpl = async (url, init) => {
    const token = url.split('/bot')[1].split('/')[0];
    if (url.endsWith('/getMe')) return validateFetch(url, init);
    if (url.endsWith('/getUpdates')) {
      offsets.set(token, JSON.parse(init.body).offset);
      const updates = await new Promise(resolve => { releases.set(token, resolve); entered.get(token)?.(); });
      return { ok: true, status: 200, json: async () => ({ ok: true, result: updates }) };
    }
    throw new Error('unexpected_request');
  };
  const service = createSwitchboardService({ context: f.context, fetchImpl, idleDelayMs: 1 });
  await service.configure({ token: 'one-token', enabled: true });
  const created = await service.createConnection({ name: 'Other', token: 'two-token', enabled: true });
  const id = created.connections[1].id;
  f.settings.set('transport-state', { ...f.settings.get('transport-state'), offset: 80 });
  f.settings.set(`connection-${id}-transport-state`, { ...f.settings.get(`connection-${id}-transport-state`), offset: 12 });
  const both = Promise.all(['one-token', 'two-token'].map(token => new Promise(resolve => entered.set(token, resolve))));
  await service.start(); await both;
  assert.equal(offsets.get('one-token'), 80); assert.equal(offsets.get('two-token'), 12);
  await service.configureConnection(id, { enabled: false });
  releases.get('two-token')([{ update_id: 99, message: { chat: { id: 42, type: 'private' }, text: 'late' } }]);
  await settle(); await settle();
  const state = await service.publicState(); assert.equal(state.connections[1].pending.length, 0);
  assert.equal(f.settings.get(`connection-${id}-transport-state`).offset, 12);
  releases.get('one-token')([]);
  // Keep fake fetch abortable during the final drain.
  const closing = service.close(); await settle(); releases.get('one-token')([]); releases.get('two-token')([]); await closing;
});

test('removing a bot aborts a blocked reconciliation send before draining its worker', { timeout: 2000 }, async () => {
  let entered;
  const sending = new Promise(resolve => { entered = resolve; });
  const f = multiFixture(); const validateFetch = f.fetchImpl;
  let aborted = false;
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/getMe')) return validateFetch(url, init);
    if (url.endsWith('/sendMessage')) {
      entered();
      await new Promise((resolve, reject) => init.signal.addEventListener('abort', () => { aborted = true; reject(init.signal.reason); }, { once: true }));
    }
    throw new Error('unexpected_request');
  };
  f.context.agents.turns.read = async id => ({ id, status: 'succeeded', result: { answerText: 'pending reply' } });
  const service = createSwitchboardService({ context: f.context, fetchImpl });
  await service.configure({ token: 'one-token', enabled: true });
  f.settings.set('deliveries', [{ id: 'in:1', direction: 'inbound', chatId: '42', turnId: 'turn-1', status: 'processing' }]);
  await service.start(); await sending;
  await service.removeConnection('default');
  assert.equal(aborted, true); assert.deepEqual((await service.publicState()).connections, []);
  assert.equal(f.settings.has('deliveries'), false); assert.equal(f.secrets.has('telegram-bot-token'), false);
  await service.close();
});

test('disabling cannot start a replacement poll while configuration persistence is blocked', { timeout: 2000 }, async () => {
  const f = multiFixture(); const validateFetch = f.fetchImpl;
  let entered, releaseWrite, writeEntered;
  let polls = 0;
  const polling = new Promise(resolve => { entered = resolve; });
  const writing = new Promise(resolve => { writeEntered = resolve; });
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/getMe')) return validateFetch(url, init);
    if (url.endsWith('/getUpdates')) {
      polls++; entered();
      await new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
    }
    throw new Error('unexpected_request');
  };
  const service = createSwitchboardService({ context: f.context, fetchImpl, idleDelayMs: 1 });
  await service.configure({ token: 'one-token', enabled: true });
  await service.start(); await polling;
  const set = f.context.settings.set;
  f.context.settings.set = async (key, value) => {
    if (key === 'configuration' && value.enabled === false) { writeEntered(); await new Promise(resolve => { releaseWrite = resolve; }); }
    return set(key, value);
  };
  const disabling = service.configure({ enabled: false }); await writing;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(polls, 1); releaseWrite(); await disabling;
  assert.equal((await service.publicState()).transport.polling, 'stopped');
  await service.close();
});

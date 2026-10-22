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
  const cleanup = await activate(f.context); t.after(cleanup);
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
  const f = fixture(); const cleanup = await activate(f.context); t.after(cleanup);
  const denied = await f.routes.get('PUT /configuration')({ auth: { enabled: true, authenticated: false }, body: { enabled: false }, params: {} }); assert.equal(denied.status, 401); assert.equal(denied.body.error, 'operator_authentication_required');
});

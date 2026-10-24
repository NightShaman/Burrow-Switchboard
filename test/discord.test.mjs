import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscordApi, createDiscordConnection, createDiscordRoomHistory } from '../server/discord.mjs';

const BOT = { id: '123456789012345678', username: 'hatchet', global_name: 'Hatchet', bot: true };
const OTHER = { id: '123456789012345679', username: 'smatchet', bot: true };
const CHANNEL = '223456789012345678';
const GUILD = '323456789012345678';
const USER = { id: '423456789012345678', username: 'human', global_name: 'Human' };
const settle = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await settle(); }
  assert.fail('condition did not settle');
}
function store() {
  const data = new Map();
  return { data, get: async (key, fallback = null) => data.has(key) ? structuredClone(data.get(key)) : fallback, set: async (key, value) => data.set(key, structuredClone(value)) };
}
function fixture({ globalSettings = store(), settings = store(), fetchImpl, connectionId = 'one', ...extra } = {}) {
  const secrets = new Map([['discord-bot-token', 'secret']]); const submissions = []; const sent = [];
  let turn = { id: 'turn-1', status: 'queued' };
  settings.data.set('configuration', { enabled: true });
  const context = {
    settings,
    secrets: { get: async key => secrets.get(key), has: async key => secrets.has(key), set: async (key, value) => secrets.set(key, value), clear: async key => secrets.delete(key) },
    agents: { list: async () => [{ id: 'hatchet', name: 'Hatchet', enabled: true }], turns: {
      submit: async input => { submissions.push(structuredClone(input)); return { turn: { ...turn, id: `turn-${submissions.length}` } }; },
      read: async id => ({ ...turn, id }),
    } }, logger: { error() { assert.fail('must not log transport errors'); } },
  };
  const fetcher = fetchImpl || (async url => {
    if (url.endsWith('/users/@me')) return response(BOT);
    if (url.endsWith('/gateway/bot')) return response({ url: 'wss://gateway.discord.gg' });
    if (/\/channels\/\d+$/.test(url)) return response({ id: url.split('/').at(-1), guild_id: GUILD, name: 'Council', type: 0 });
    throw new Error('unexpected request');
  });
  const service = createDiscordConnection({ context, connectionId, fetchImpl: fetcher, discordHistorySettings: globalSettings, ...extra });
  const api = { sendMessage: async input => { sent.push(input); return { id: `923456789012345${String(sent.length).padStart(3, '0')}` }; } };
  return { service, context, settings, globalSettings, secrets, submissions, sent, api, setTurn: value => { turn = value; }, fetchImpl: fetcher };
}
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) }; }
function message(id = '523456789012345678', patch = {}) {
  return { id, channel_id: CHANNEL, guild_id: GUILD, author: USER, content: 'hello', mentions: [], ...patch };
}
async function admit(f, msg = message(), bot = BOT) {
  await f.service.processMessage(msg, bot);
  const state = await f.service.publicState();
  const request = state.pending.find(item => item.channelId === msg.channel_id);
  assert.ok(request); await f.service.approve(request.id, { agentId: 'hatchet' });
  return request;
}

test('REST v10 preserves raw identity and string snowflakes, auth header, safe mention policy and nonce', async () => {
  const calls = [];
  const api = createDiscordApi({ token: 'very-secret', fetchImpl: async (url, init) => { calls.push({ url, init }); return response(BOT); } });
  assert.deepEqual(await api.getMe(), BOT);
  await api.getGatewayBot(); await api.getChannel(CHANNEL);
  await api.sendMessage({ channelId: CHANNEL, text: '@everyone hello', replyToMessageId: '523456789012345679', nonce: 'unique' });
  assert.equal(calls[0].url, 'https://discord.com/api/v10/users/@me');
  assert.equal(calls[0].init.headers.Authorization, 'Bot very-secret');
  assert.ok(calls.every(call => !call.url.includes('very-secret')));
  const body = JSON.parse(calls.at(-1).init.body);
  assert.deepEqual(body.allowed_mentions, { parse: [], replied_user: false });
  assert.equal(body.message_reference.message_id, '523456789012345679'); assert.equal(body.enforce_nonce, true);
  assert.throws(() => api.getChannel(Number(CHANNEL)), /discord_response_invalid/);
});

test('REST errors are sanitized; retry explicit 429, never ambiguous sends', async () => {
  assert.throws(() => createDiscordApi({ token: '' }), /discord_token_missing/);
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    const api = createDiscordApi({ token: 'secret', fetchImpl: async () => { calls++; return response({ message: 'secret', retry_after: 20 }, status); } });
    await assert.rejects(api.sendMessage({ channelId: CHANNEL, text: 'test' }), new RegExp(status === 429 ? 'discord_rate_limited' : status < 429 ? 'discord_auth_failed' : 'discord_request_failed'));
    assert.equal(calls, 1);
  }
  let calls = 0;
  const api = createDiscordApi({ token: 'secret', fetchImpl: async () => ++calls === 1 ? response({ retry_after: 0 }, 429) : response(BOT) });
  assert.deepEqual(await api.getMe(), BOT); assert.equal(calls, 2);
  await assert.rejects(createDiscordApi({ token: 'secret', fetchImpl: async () => { throw new Error('secret network'); } }).getMe(), /^Error: discord_request_failed$/);
  await assert.rejects(createDiscordApi({ token: 'secret', fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('secret'); } }) }).getMe(), /discord_response_invalid/);
});

test('admissions retain channel identity, thread routes independent, no implicit guild grant; snowflakes exact', async () => {
  const f = fixture({ fetchImpl: async url => response({ id: url.split('/').at(-1), guild_id: GUILD, name: 'Thread', type: 11, parent_id: CHANNEL }) });
  const request = await admit(f);
  assert.equal(request.channelId, CHANNEL); assert.equal(request.guildId, GUILD); assert.equal(request.chatType, 'thread'); assert.equal(request.chatTitle, 'Thread');
  await f.service.processMessage(message('523456789012345679', { content: `<@${BOT.id}> answer`, mentions: [BOT] }), BOT);
  assert.equal(f.submissions.length, 1); assert.equal(f.submissions[0].sessionId, `discord:one:${CHANNEL}`);
  assert.ok(f.submissions[0].sessionId.length < 128); assert.match(f.submissions[0].idempotencyKey, /523456789012345679$/);
  assert.doesNotMatch(f.submissions[0].message.split('[End Discord conversation context]').at(-1), /<@/);
  assert.equal(f.submissions[0].displayMessage, 'answer');
  await f.service.processMessage(message('523456789012345680', { channel_id: '223456789012345679', content: `<@${BOT.id}> thread?`, mentions: [BOT] }), BOT);
  assert.equal(f.submissions.length, 1); assert.equal((await f.service.publicState()).pending.length, 1);
  const state = await f.service.publicState(); assert.equal(state.mappings.length, 1); assert.equal(state.bot.configured, true);
  await f.service.close();
});

test('human mention/reply routing; bots and webhooks context only; DM all text and isolated per connection', async () => {
  const globalSettings = store(); const f = fixture({ globalSettings });
  await admit(f);
  await f.service.processMessage(message('523456789012345679', { content: 'not for you' }), BOT);
  await f.service.processMessage(message('523456789012345680', { author: OTHER, content: `<@${BOT.id}> bot context`, mentions: [BOT] }), BOT);
  await f.service.processMessage(message('523456789012345681', { webhook_id: '623456789012345678', content: `<@${BOT.id}> webhook context`, mentions: [BOT] }), BOT);
  assert.equal(f.submissions.length, 0);
  await f.service.processMessage(message('523456789012345682', { content: 'reply question', message_reference: { message_id: '523456789012345600', channel_id: CHANNEL }, referenced_message: { id: '523456789012345600', content: 'quoted answer', author: BOT, channel_id: CHANNEL } }), BOT);
  assert.equal(f.submissions.length, 1); assert.match(f.submissions[0].message, /quoted answer/); assert.match(f.submissions[0].message, /bot context/); assert.match(f.submissions[0].message, /webhook context/);
  assert.equal(f.submissions[0].displayMessage, 'reply question'); assert.doesNotMatch(f.submissions[0].displayMessage, /quoted answer|bot context|webhook context/);
  await f.service.processMessage(message('523456789012345683', { content: 'cross-channel reply', message_reference: { message_id: '523456789012345600', channel_id: '1' }, referenced_message: { id: '523456789012345600', content: 'private', author: BOT, channel_id: '1' } }), BOT);
  assert.equal(f.submissions.length, 1);
  const dm = message('623456789012345678', { guild_id: undefined, channel_id: '723456789012345678', channel: { type: 1 }, content: 'private secret' });
  await admit(f, dm); await f.service.processMessage(dm, BOT); assert.equal(f.submissions.length, 2);
  const g = fixture({ globalSettings, connectionId: 'two' }); await admit(g, { ...dm, id: '623456789012345679', content: 'second DM' }, OTHER);
  await g.service.processMessage({ ...dm, id: '623456789012345680', content: 'second bot DM' }, OTHER);
  assert.equal(g.submissions.length, 1); assert.doesNotMatch(g.submissions[0].message, /private secret/);
  assert.equal(g.submissions[0].sessionId, `discord:two:${dm.channel_id}`);
  await f.service.close(); await g.service.close();
});

test('shared guild history dedups snowflakes across approved bots and survives restart; guild/thread isolation', async () => {
  const globalSettings = store(); let f = fixture({ globalSettings }); const g = fixture({ globalSettings, connectionId: 'two' });
  await admit(f); await admit(g, message(), OTHER);
  const shared = message('523456789012345679', { content: 'shared ambient context' });
  await Promise.all([f.service.processMessage(shared, BOT), g.service.processMessage(shared, OTHER)]);
  await f.service.processMessage(message('523456789012345680', { author: OTHER, content: 'other bot answer' }), BOT);
  await g.service.processMessage(message('523456789012345681', { content: `<@${OTHER.id}> question`, mentions: [OTHER] }), OTHER);
  assert.equal(g.submissions.length, 1); assert.equal((g.submissions[0].message.match(/shared ambient context/g) || []).length, 1); assert.match(g.submissions[0].message, /other bot answer/);
  await f.service.close(); f = fixture({ globalSettings, settings: f.settings });
  await f.service.processMessage(message('523456789012345682', { content: `<@${BOT.id}> restarted`, mentions: [BOT] }), BOT);
  assert.match(f.submissions[0].message, /shared ambient context/);
  const otherGuild = message('523456789012345683', { guild_id: '323456789012345679', channel: { name: 'Other', type: 0 }, content: 'other guild' });
  await admit(f, otherGuild); await f.service.processMessage({ ...otherGuild, id: '523456789012345684', content: `<@${BOT.id}> isolated`, mentions: [BOT] }, BOT);
  assert.doesNotMatch(f.submissions[1].message, /shared ambient context|other bot answer/);
  const thread = message('523456789012345685', { channel_id: '223456789012345679', channel: { name: 'Thread', type: 11 }, content: 'thread only' });
  await admit(f, thread); await f.service.processMessage({ ...thread, id: '523456789012345686', content: `<@${BOT.id}> thread question`, mentions: [BOT] }, BOT);
  assert.doesNotMatch(f.submissions[2].message, /shared ambient context|other bot answer/);
  assert.ok(globalSettings.data.has('discord-room-history')); assert.equal(globalSettings.data.has('telegram-room-history'), false);
  await f.service.close(); await g.service.close();
});

test('duplicate events serialize; uncertain Core submit retries durable exact input despite changing history and restart', async () => {
  let f = fixture(); await admit(f);
  const trigger = message('523456789012345679', { content: `<@${BOT.id}> question`, mentions: [BOT] });
  await Promise.all([f.service.processMessage(trigger, BOT), f.service.processMessage(trigger, BOT)]);
  assert.equal(f.submissions.length, 1);
  const uncertain = message('523456789012345680', { content: `<@${BOT.id}> uncertain`, mentions: [BOT] });
  f.context.agents.turns.submit = async input => { f.submissions.push(structuredClone(input)); throw new Error('secret uncertain'); };
  await f.service.processMessage(uncertain, BOT); const original = structuredClone(f.submissions.at(-1));
  assert.equal((await f.service.publicState()).deliveries[0].status, 'submitting');
  assert.doesNotMatch(JSON.stringify(await f.service.publicState()), /secret uncertain|"submission"/);
  const settings = f.settings, globalSettings = f.globalSettings; await f.service.close();
  f = fixture({ settings, globalSettings });
  await f.service.processMessage(message('523456789012345681', { content: 'new ambient' }), BOT);
  await f.service.reconcile(f.api); assert.deepEqual(f.submissions[0], original);
  await f.service.processMessage(uncertain, BOT); assert.equal(f.submissions.length, 1);
  await f.service.close();
});

test('outbound UTF16 chunks and replies, dedup reconcile; ambiguity and interrupted write-ahead are never resent', async () => {
  const f = fixture(); await admit(f);
  await f.service.processMessage(message('523456789012345679', { content: `<@${BOT.id}> question`, mentions: [BOT] }), BOT);
  f.setTurn({ status: 'succeeded', result: { answerText: `${'x'.repeat(1999)}😀${'z'.repeat(2000)}` } });
  await Promise.all([f.service.reconcile(f.api), f.service.reconcile(f.api)]);
  assert.equal(f.sent.length, 3); assert.equal(f.sent.map(item => item.text).join(''), `${'x'.repeat(1999)}😀${'z'.repeat(2000)}`);
  assert.ok(f.sent.every(item => item.text.length <= 2000 && item.text.isWellFormed()));
  assert.equal(f.sent[0].replyToMessageId, '523456789012345679'); assert.equal(f.sent[1].replyToMessageId, null);
  assert.ok((await f.service.publicState()).deliveries.every(item => item.status === 'delivered'));
  await f.service.processMessage(message('523456789012345680', { content: `<@${BOT.id}> next`, mentions: [BOT] }), BOT);
  let attempts = 0; const uncertainApi = { sendMessage: async () => { attempts++; throw new Error('secret HTTP timeout'); } };
  await f.service.reconcile(uncertainApi); await f.service.reconcile(uncertainApi); assert.equal(attempts, 1);
  assert.equal((await f.service.publicState()).deliveries.find(item => item.id === 'out:turn-2').status, 'unknown');
  const saved = await f.settings.get('deliveries'); saved.find(item => item.id === 'out:turn-2').status = 'sending'; await f.settings.set('deliveries', saved);
  await f.service.reconcile(uncertainApi); assert.equal(attempts, 1); assert.equal((await f.service.publicState()).deliveries.find(item => item.id === 'out:turn-2').status, 'unknown');
  await f.service.close();
});

test('deletion suppresses an in-flight read and queued replies even after re-admission', async () => {
  const f = fixture(); const route = await admit(f);
  await f.service.processMessage(message('523456789012345679', { content: `<@${BOT.id}> question`, mentions: [BOT] }), BOT);
  let release; let entered = false;
  f.context.agents.turns.read = () => { entered = true; return new Promise(resolve => { release = resolve; }); };
  const reconciling = f.service.reconcile(f.api); await until(() => entered);
  const deleted = f.service.deleteMapping(route.id);
  release({ id: 'turn-1', status: 'succeeded', result: { answerText: 'must not send' } });
  await reconciling; await deleted; assert.equal(f.sent.length, 0);
  await admit(f, message('523456789012345680')); await f.service.reconcile(f.api);
  assert.equal(f.sent.length, 0); assert.equal((await f.service.publicState()).deliveries[0].status, 'interrupted');
  await f.service.close();
});

test('disable, token clear and close stop late Core/send/event activity and retain bot binding', async () => {
  const f = fixture(); await f.service.configure({ enabled: true, token: 'secret', bot: BOT }); await admit(f);
  await f.service.configure({ enabled: false });
  await f.service.processMessage(message('523456789012345679', { content: `<@${BOT.id}> disabled`, mentions: [BOT] }), BOT); assert.equal(f.submissions.length, 0);
  await f.service.configure({ enabled: true });
  await f.service.processMessage(message('523456789012345680', { content: `<@${BOT.id}> started`, mentions: [BOT] }), BOT);
  let entered = false, release;
  f.context.agents.turns.read = async () => { entered = true; return new Promise(resolve => { release = resolve; }); };
  const reading = f.service.reconcile(f.api); await until(() => entered);
  const clearing = f.service.clearToken();
  release({ id: 'turn-1', status: 'succeeded', result: { answerText: 'late response' } });
  await reading; await clearing;
  assert.equal(f.sent.length, 0); assert.equal((await f.service.publicState()).tokenConfigured, false);
  await f.service.processMessage(message('523456789012345681', { content: 'late DM', guild_id: undefined }), BOT); assert.equal((await f.service.publicState()).pending.length, 0);
  await assert.rejects(f.service.configure({ enabled: true, token: 'other-token', bot: OTHER }), /discord_bot_changed_add_connection/);
  await f.service.close(); await f.service.processMessage(message('523456789012345682'), BOT); assert.equal((await f.service.publicState()).pending.length, 0);
});

class MockSocket {
  static instances = [];
  constructor(url) { this.url = url; this.handlers = new Map(); this.sent = []; this.closed = false; MockSocket.instances.push(this); }
  addEventListener(event, handler) { if (!this.handlers.has(event)) this.handlers.set(event, []); this.handlers.get(event).push(handler); }
  emit(event, data = {}) { for (const handler of this.handlers.get(event) || []) handler(data); }
  packet(packet) { this.emit('message', { data: JSON.stringify(packet) }); }
  send(payload) { assert.equal(this.closed, false); this.sent.push(JSON.parse(payload)); }
  close() { this.closed = true; this.emit('close', { code: 1000 }); }
}
function timers() {
  const handles = [];
  return { handles, setTimeoutImpl: (fn, ms) => { const handle = { fn, ms, cleared: false, unref() {} }; handles.push(handle); return handle; }, clearTimeoutImpl: handle => { if (handle) handle.cleared = true; },
    fire(ms) { const handle = handles.find(item => !item.cleared && item.ms === ms); assert.ok(handle, `timer ${ms} exists`); handle.cleared = true; handle.fn(); },
  };
}
async function gatewayFixture() {
  MockSocket.instances = []; const time = timers(); const f = fixture({ WebSocketImpl: MockSocket, retryDelayMs: 3, reconcileIntervalMs: 20, ...time });
  await f.service.start(); await until(() => MockSocket.instances.length === 1);
  return { ...f, time, ws: MockSocket.instances[0] };
}

test('Gateway native open/hello identify, heartbeat ACK, missed ACK reconnect and resume with sequence', async () => {
  const f = await gatewayFixture(); const ws = f.ws;
  assert.equal(ws.url, 'wss://gateway.discord.gg/?v=10&encoding=json'); assert.equal(ws.sent.length, 0);
  ws.emit('open'); assert.equal(ws.sent.length, 0);
  ws.packet({ op: 10, d: { heartbeat_interval: 100 } });
  assert.equal(ws.sent[0].op, 2); assert.equal(ws.sent[0].d.intents, 37377); assert.equal(ws.sent[0].d.token, 'secret');
  ws.packet({ op: 0, t: 'READY', s: 10, d: { session_id: 'session', resume_gateway_url: 'wss://gateway.discord.gg' } });
  await until(async () => (await f.service.publicState()).transport.gateway === 'active');
  f.time.fire(100); assert.deepEqual(ws.sent.at(-1), { op: 1, d: 10 });
  ws.packet({ op: 11 }); f.time.fire(100); assert.equal(ws.closed, false);
  f.time.fire(100); assert.equal(ws.closed, true); f.time.fire(3);
  await until(() => MockSocket.instances.length === 2); const resumed = MockSocket.instances[1];
  resumed.emit('open'); resumed.packet({ op: 10, d: { heartbeat_interval: 100 } });
  assert.deepEqual(resumed.sent[0], { op: 6, d: { token: 'secret', session_id: 'session', seq: 10 } });
  resumed.packet({ op: 0, t: 'RESUMED', s: 11, d: {} }); await f.service.publicState(); resumed.packet({ op: 1 }); assert.deepEqual(resumed.sent.at(-1), { op: 1, d: 11 });
  const clearing = f.service.clearToken(); resumed.packet({ op: 0, t: 'MESSAGE_CREATE', s: 12, d: message() }); await clearing;
  assert.equal(resumed.closed, true); assert.equal(f.submissions.length, 0); assert.equal((await f.service.publicState()).pending.length, 0);
  assert.ok(f.time.handles.every(handle => handle.cleared)); await f.service.close();
});

test('Gateway reconnect op, invalid session reidentify, fatal intent close, late sockets ignored', async () => {
  const f = await gatewayFixture(); f.ws.emit('open'); f.ws.packet({ op: 10, d: { heartbeat_interval: 100 } });
  f.ws.packet({ op: 0, t: 'READY', s: 3, d: { session_id: 'session', resume_gateway_url: 'wss://gateway.discord.gg' } });
  await f.service.publicState();
  f.ws.packet({ op: 7 }); f.time.fire(3); await until(() => MockSocket.instances.length === 2);
  const next = MockSocket.instances[1]; next.emit('open'); next.packet({ op: 10, d: { heartbeat_interval: 100 } }); assert.equal(next.sent[0].op, 6);
  f.ws.packet({ op: 0, t: 'MESSAGE_CREATE', s: 99, d: message() }); assert.equal((await f.service.publicState()).pending.length, 0);
  next.packet({ op: 9, d: false }); f.time.fire(1000); await until(() => MockSocket.instances.length === 3);
  const fresh = MockSocket.instances[2]; fresh.emit('open'); fresh.packet({ op: 10, d: { heartbeat_interval: 100 } }); assert.equal(fresh.sent[0].op, 2);
  fresh.emit('close', { code: 4014 });
  await until(async () => (await f.service.publicState()).transport.error === 'discord_gateway_intents_disallowed');
  assert.equal(fresh.closed, true); await f.service.close(); assert.ok(f.time.handles.every(handle => handle.cleared));
});

test('late REST gateway handshake cannot restore token-cleared socket or identity', async () => {
  MockSocket.instances = []; let release, entered = false;
  const f = fixture({ WebSocketImpl: MockSocket, fetchImpl: async url => {
    if (url.endsWith('/users/@me')) return response(BOT);
    entered = true; return new Promise(resolve => { release = resolve; });
  } });
  await f.service.start(); await until(() => entered); await f.service.clearToken();
  release(response({ url: 'wss://gateway.discord.gg' })); await settle(); await settle();
  assert.equal(MockSocket.instances.length, 0); assert.equal((await f.service.publicState()).bot.configured, false); await f.service.close();
});

test('Discord history is bounded, string-ordered and separately namespaced', async () => {
  const settings = store(); const history = createDiscordRoomHistory({ settings });
  const mapping = { channelId: CHANNEL, guildId: GUILD };
  for (let n = 0; n < 70; n++) await history.record(mapping, message(`523456789012345${String(n).padStart(3, '0')}`, { content: `${n} ${'x'.repeat(5000)}` }), 'one');
  const rooms = settings.data.get('discord-room-history'); assert.equal(rooms[0].messages.length, 50); assert.ok(rooms[0].messages.every(item => item.text.length <= 4000));
  const context = await history.context(mapping, '523456789012345069', 'two');
  assert.ok(context.length > 0 && context.length < 5); assert.ok(context.every(item => item.messageId < '523456789012345069'));
  await history.record(mapping, { ...message(), id: Number('523456789012345069') }, 'one'); assert.equal(settings.data.get('discord-room-history')[0].messages.length, 50);
});

test('Gateway dispatch admits, approved events route once, periodic reconciliation delivers and disable closes socket', async () => {
  const f = await gatewayFixture(); f.ws.emit('open'); f.ws.packet({ op: 10, d: { heartbeat_interval: 100 } });
  f.ws.packet({ op: 0, t: 'READY', s: 1, d: { session_id: 'session', resume_gateway_url: 'wss://gateway.discord.gg' } });
  f.ws.packet({ op: 0, t: 'MESSAGE_CREATE', s: 2, d: message() });
  await until(async () => (await f.service.publicState()).pending.length === 1);
  const request = (await f.service.publicState()).pending[0]; await f.service.approve(request.id, { agentId: 'hatchet' });
  const trigger = message('523456789012345679', { content: `<@${BOT.id}> question`, mentions: [BOT] });
  f.ws.packet({ op: 0, t: 'MESSAGE_CREATE', s: 3, d: trigger }); f.ws.packet({ op: 0, t: 'MESSAGE_CREATE', s: 4, d: trigger });
  await until(() => f.submissions.length === 1); await f.service.publicState(); assert.equal(f.submissions.length, 1);
  f.setTurn({ status: 'succeeded', result: { answerText: 'answer' } });
  // Complete via the explicit API, then prove the periodic worker does not duplicate it.
  await f.service.reconcile(f.api); assert.equal(f.sent.length, 1);
  f.time.fire(20); await settle(); await f.service.publicState(); assert.equal(f.sent.length, 1);
  await f.service.configure({ enabled: false }); assert.equal(f.ws.closed, true);
  assert.ok(f.time.handles.every(handle => handle.cleared)); await f.service.close();
});

test('Gateway auth errors sanitized and do not reconnect, handshake timeout reconnects safely', async () => {
  const time = timers(); const f = fixture({ ...time, WebSocketImpl: MockSocket, fetchImpl: async () => response({ message: 'secret' }, 401) });
  await f.service.start(); await until(async () => (await f.service.publicState()).transport.error === 'discord_auth_failed');
  assert.equal(time.handles.filter(item => !item.cleared).length, 0); assert.doesNotMatch(JSON.stringify(await f.service.publicState()), /secret/); await f.service.close();
  const g = await gatewayFixture(); g.time.fire(15000); assert.equal(g.ws.closed, true); g.time.fire(3);
  await until(() => MockSocket.instances.length === 2); await g.service.close(); assert.ok(g.time.handles.every(handle => handle.cleared));
});

test('admission denial, disabled routes, schema validation and numeric snowflakes never trigger', async () => {
  const f = fixture(); await f.service.processMessage(message(), BOT); let state = await f.service.publicState();
  await assert.rejects(f.service.approve(state.pending[0].id, { agentId: 'missing' }), /agent_not_found/);
  await f.service.deny(state.pending[0].id); assert.equal((await f.service.publicState()).pending.length, 0);
  const route = await admit(f); await f.service.updateMapping(route.id, { agentId: 'hatchet', enabled: false });
  await f.service.processMessage(message('523456789012345679', { content: `<@${BOT.id}> disabled`, mentions: [BOT] }), BOT);
  assert.equal(f.submissions.length, 0); assert.equal((await f.service.publicState()).pending.length, 0);
  await f.service.updateMapping(route.id, { agentId: 'hatchet', enabled: true });
  await f.service.processMessage(message(Number('523456789012345680'), { content: `<@${BOT.id}> numeric`, mentions: [BOT] }), BOT);
  assert.equal(f.submissions.length, 0);
  await assert.rejects(f.service.configure({ enabled: true, token: '' }), /discord_token_invalid/);
  await assert.rejects(f.service.configure({ enabled: true, surprise: true }), /configuration_invalid/);
  await f.service.close();
});

test('token clear aborts an in-flight send and prevents all later chunks and state resurrection', async () => {
  const f = fixture(); await admit(f);
  await f.service.processMessage(message('523456789012345679', { content: `<@${BOT.id}> question`, mentions: [BOT] }), BOT);
  f.setTurn({ status: 'succeeded', result: { answerText: 'x'.repeat(4500) } });
  let entered = false, sends = 0, signal;
  const sending = f.service.reconcile({ sendMessage: async input => {
    sends++; entered = true; signal = input.signal;
    return new Promise((resolve, reject) => input.signal.addEventListener('abort', () => reject(new Error('secret')), { once: true }));
  } });
  await until(() => entered); await f.service.clearToken(); await sending;
  assert.equal(signal.aborted, true); assert.equal(sends, 1);
  const state = await f.service.publicState(); assert.equal(state.enabled, false); assert.equal(state.transport.gateway, 'stopped'); assert.equal(state.bot.configured, false);
  assert.equal(state.deliveries.find(item => item.direction === 'outbound').status, 'sending');
  await f.service.close();
});

test('durable backlog never evicts uncertain submissions to accept more input', async () => {
  const f = fixture(); await admit(f);
  await f.settings.set('deliveries', Array.from({ length: 200 }, (_, n) => ({ id: `in:old-${n}`, direction: 'inbound', status: 'submitting', submission: { message: `frozen-${n}` } })));
  await assert.rejects(f.service.processMessage(message('523456789012345679', { content: `<@${BOT.id}> new`, mentions: [BOT] }), BOT), /discord_backlog_full/);
  assert.equal(f.submissions.length, 0); const saved = await f.settings.get('deliveries'); assert.equal(saved.length, 200); assert.equal(saved[0].submission.message, 'frozen-0');
  await f.service.close();
});

test('outbound REST content preserves boundary whitespace exactly and configure requires a bot identity', async () => {
  const calls = [];
  const api = createDiscordApi({ token: 'secret', fetchImpl: async (_url, init) => { calls.push(JSON.parse(init.body).content); return response({ id: '923456789012345678' }); } });
  await api.sendMessage({ channelId: CHANNEL, text: ' word \n' });
  await api.sendMessage({ channelId: CHANNEL, text: '\n next' });
  assert.deepEqual(calls, [' word \n', '\n next']);
  const f = fixture({ fetchImpl: async () => response({ id: BOT.id, username: 'not-a-bot' }) });
  await assert.rejects(f.service.configure({ enabled: false, token: 'different' }), /discord_response_invalid/);
  await f.service.close();
});

test('failed Gateway event persistence resumes before the gap instead of acknowledging lost messages', async () => {
  const f = await gatewayFixture();
  f.ws.emit('open'); f.ws.packet({ op: 10, d: { heartbeat_interval: 100 } });
  f.ws.packet({ op: 0, t: 'READY', s: 10, d: { session_id: 'session', resume_gateway_url: 'wss://gateway.discord.gg' } });
  await f.service.publicState();
  const save = f.settings.set; let failOnce = true;
  f.settings.set = async (key, value) => {
    if (key === 'pending-admissions' && failOnce) { failOnce = false; throw new Error('storage_unavailable'); }
    return save(key, value);
  };
  f.ws.packet({ op: 0, t: 'MESSAGE_CREATE', s: 11, d: message() });
  f.ws.packet({ op: 0, t: 'MESSAGE_CREATE', s: 12, d: message('523456789012345679') });
  await until(() => f.ws.closed);
  assert.equal((await f.service.publicState()).pending.length, 0);
  f.time.fire(3); await until(() => MockSocket.instances.length === 2);
  const ws = MockSocket.instances[1]; ws.emit('open'); ws.packet({ op: 10, d: { heartbeat_interval: 100 } });
  assert.deepEqual(ws.sent[0], { op: 6, d: { token: 'secret', session_id: 'session', seq: 10 } });
  ws.packet({ op: 0, t: 'MESSAGE_CREATE', s: 11, d: message() });
  await until(async () => (await f.service.publicState()).pending.length === 1);
  await f.service.close();
});

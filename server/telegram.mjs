import { createHash } from 'node:crypto';

const MAX_PENDING = 100;
const MAX_MAPPINGS = 250;
const MAX_DELIVERIES = 200;
const TELEGRAM_MESSAGE_LIMIT = 4000;
const TERMINAL_TURNS = new Set(['succeeded', 'failed', 'interrupted']);
const nowIso = clock => new Date(clock()).toISOString();

function exactObject(value, allowed, code = 'input_invalid') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw Object.assign(new Error(code), { statusCode: 400 });
  return value;
}
function boundedString(value, max, code = 'input_invalid') {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Object.assign(new Error(code), { statusCode: 400 });
  return value.trim();
}
function publicError(error, fallback = 'telegram_unavailable') {
  const known = new Set(['telegram_auth_failed', 'telegram_rate_limited', 'telegram_request_failed', 'telegram_response_invalid', 'telegram_token_missing']);
  return known.has(error?.message) ? error.message : fallback;
}
function stableId(value) { return createHash('sha256').update(String(value)).digest('hex').slice(0, 24); }
function chatKey(chatId, topicId = null) { return `${String(chatId)}:${topicId === null || topicId === undefined ? 'root' : String(topicId)}`; }
function routeId(chatId, topicId = null) { return stableId(`telegram:${chatKey(chatId, topicId)}`); }
function chatType(value) { return value === 'private' ? 'direct' : ['group', 'supergroup', 'channel'].includes(value) ? value : 'chat'; }
function chatTitle(chat = {}, sender = {}) {
  return String(chat.title || [sender.first_name, sender.last_name].filter(Boolean).join(' ') || sender.username || chat.username || chat.id || 'Telegram chat').slice(0, 180);
}
function senderName(sender = {}) { return String([sender.first_name, sender.last_name].filter(Boolean).join(' ') || sender.username || sender.id || 'Telegram user').slice(0, 180); }
function sessionIdFor(mapping) { return `telegram:${mapping.chatId}:${mapping.topicId ?? 'root'}`.slice(0, 128); }
function telegramPrompt(message, mapping) {
  const sender = message.from || {};
  const identity = sender.username ? `${senderName(sender)} (@${sender.username})` : senderName(sender);
  return `[Telegram message from ${identity} in ${mapping.chatTitle}]\n\n${String(message.text || '').trim()}`;
}
function botMentioned(message, bot) {
  if (!bot?.username) return false;
  const needle = `@${String(bot.username).replace(/^@/, '')}`.toLowerCase();
  return String(message.text || '').toLowerCase().includes(needle) || String(message.reply_to_message?.from?.id || '') === String(bot.id || '');
}
function stripBotMention(text, bot) {
  if (!bot?.username) return String(text || '').trim();
  return String(text || '').replace(new RegExp(`@${String(bot.username).replace(/^@/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), '').trim();
}
function chunks(text) {
  const chars = Array.from(String(text || ''));
  const out = [];
  while (chars.length) out.push(chars.splice(0, TELEGRAM_MESSAGE_LIMIT).join(''));
  return out;
}
function boundedList(value, max) { return Array.isArray(value) ? value.slice(0, max) : []; }

export function createTelegramApi({ token, fetchImpl = fetch }) {
  if (typeof token !== 'string' || !token) throw new Error('telegram_token_missing');
  async function call(method, body = {}, { signal } = {}) {
    let response;
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('telegram_request_failed');
    }
    if (response.status === 401 || response.status === 403) throw new Error('telegram_auth_failed');
    if (response.status === 429) throw new Error('telegram_rate_limited');
    let payload;
    try { payload = await response.json(); } catch { throw new Error('telegram_response_invalid'); }
    if (!response.ok || payload?.ok !== true) throw new Error('telegram_request_failed');
    return payload.result;
  }
  return Object.freeze({
    getMe: options => call('getMe', {}, options),
    getUpdates: ({ offset = 0, timeout = 15, signal } = {}) => call('getUpdates', { offset, timeout, allowed_updates: ['message'] }, { signal }),
    sendMessage: ({ chatId, topicId = null, text, replyToMessageId = null, signal }) => call('sendMessage', {
      chat_id: chatId, text,
      ...(topicId === null || topicId === undefined ? {} : { message_thread_id: topicId }),
      ...(replyToMessageId === null || replyToMessageId === undefined ? {} : { reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true } }),
    }, { signal }),
  });
}

export function createSwitchboardService({ context, fetchImpl = fetch, clock = Date.now, pollTimeoutSeconds = 15, idleDelayMs = 2_000, retryDelayMs = 3_000 } = {}) {
  if (!context?.settings || !context?.secrets || !context?.agents) throw new Error('switchboard_context_required');
  const controller = new AbortController();
  let loopPromise = null;
  let wakeResolve = null;
  let queue = Promise.resolve();
  const serialize = operation => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  };
  const setting = (name, fallback) => context.settings.get(name, fallback);
  const write = (name, value) => context.settings.set(name, value);
  async function configuration() { return { enabled: false, ...await setting('configuration', {}) }; }
  async function transport() { return { health: 'stopped', polling: 'stopped', lastPollAt: null, error: null, offset: 0, bot: null, ...await setting('transport-state', {}) }; }
  async function mappings() { return boundedList(await setting('mappings', []), MAX_MAPPINGS); }
  async function pending() { return boundedList(await setting('pending-admissions', []), MAX_PENDING); }
  async function deliveries() { return boundedList(await setting('deliveries', []), MAX_DELIVERIES); }
  async function replaceDelivery(item) {
    const list = await deliveries();
    const index = list.findIndex(entry => entry.id === item.id);
    if (index >= 0) list[index] = { ...list[index], ...item, updatedAt: nowIso(clock) };
    else list.unshift({ ...item, createdAt: item.createdAt || nowIso(clock), updatedAt: nowIso(clock) });
    await write('deliveries', list.slice(0, MAX_DELIVERIES));
    return index >= 0 ? list[index] : list[0];
  }
  function wake() { wakeResolve?.(); wakeResolve = null; }
  function wait(ms) {
    if (controller.signal.aborted) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(done, ms); timer.unref?.();
      function done() { clearTimeout(timer); controller.signal.removeEventListener('abort', done); if (wakeResolve === done) wakeResolve = null; resolve(); }
      wakeResolve = done; controller.signal.addEventListener('abort', done, { once: true });
    });
  }
  const coreStatus = () => context.agents?.turns?.submit && context.agents?.turns?.read
    ? { available: true }
    : { available: false, reason: 'core_external_agent_turns_unavailable' };
  async function publicState() {
    const [config, state, approved, requests, recent, tokenConfigured] = await Promise.all([configuration(), transport(), mappings(), pending(), deliveries(), context.secrets.has('telegram-bot-token')]);
    const agents = await context.agents.list();
    const names = new Map(agents.map(agent => [agent.id, agent.name || agent.id]));
    return {
      enabled: config.enabled === true,
      tokenConfigured,
      bot: state.bot ? { configured: true, id: state.bot.id, username: state.bot.username || null, displayName: state.bot.displayName || null } : { configured: tokenConfigured },
      transport: { enabled: config.enabled === true, health: state.health, polling: state.polling, lastPollAt: state.lastPollAt, error: state.error },
      coreAgentTurns: coreStatus(),
      mappings: approved.map(item => ({ ...item, agentName: names.get(item.agentId) || item.agentId })),
      pending: requests,
      deliveries: recent.map(item => ({ ...item, agentName: names.get(item.agentId) || item.agentId })),
    };
  }
  async function validateAgent(agentId) {
    const agent = (await context.agents.list()).find(item => item.id === agentId);
    if (!agent) throw Object.assign(new Error('agent_not_found'), { statusCode: 404 });
    if (!agent.enabled) throw Object.assign(new Error('agent_disabled'), { statusCode: 409 });
    return agent;
  }
  async function notePending(message) {
    const chat = message.chat || {}; const sender = message.from || {};
    const topicId = message.message_thread_id ?? null; const key = chatKey(chat.id, topicId); const id = routeId(chat.id, topicId);
    const approved = await mappings();
    if (approved.some(item => item.id === id)) return;
    const list = await pending();
    const record = { id, chatId: String(chat.id), topicId, chatTitle: chatTitle(chat, sender), chatType: chatType(chat.type), requester: { id: sender.id ? String(sender.id) : null, name: senderName(sender), username: sender.username || null }, requestedAt: nowIso(clock) };
    const index = list.findIndex(item => item.id === id);
    if (index >= 0) list[index] = { ...list[index], ...record };
    else list.unshift(record);
    await write('pending-admissions', list.slice(0, MAX_PENDING));
  }
  async function processMessage(update, bot) {
    const message = update?.message;
    if (!message?.chat?.id || typeof message.text !== 'string' || !message.text.trim()) return;
    const topicId = message.message_thread_id ?? null;
    const approved = await mappings();
    const mapping = approved.find(item => item.id === routeId(message.chat.id, topicId));
    if (!mapping || mapping.enabled === false) { await notePending(message); return; }
    if (mapping.chatType !== 'direct' && !botMentioned(message, bot)) return;
    if (!coreStatus().available) {
      await replaceDelivery({ id: `in:${update.update_id}`, direction: 'inbound', updateId: update.update_id, chatId: mapping.chatId, topicId: mapping.topicId, chatTitle: mapping.chatTitle, chatType: mapping.chatType, agentId: mapping.agentId, status: 'failed', error: 'core_external_agent_turns_unavailable', at: nowIso(clock) });
      return;
    }
    const cleanText = mapping.chatType === 'direct' ? message.text.trim() : stripBotMention(message.text, bot);
    if (!cleanText) return;
    const accepted = await context.agents.turns.submit({
      agentId: mapping.agentId,
      sessionId: sessionIdFor(mapping),
      message: telegramPrompt({ ...message, text: cleanText }, mapping),
      idempotencyKey: `telegram-update-${update.update_id}`,
    });
    await replaceDelivery({ id: `in:${update.update_id}`, direction: 'inbound', updateId: update.update_id, telegramMessageId: message.message_id, chatId: mapping.chatId, topicId: mapping.topicId, chatTitle: mapping.chatTitle, chatType: mapping.chatType, agentId: mapping.agentId, turnId: accepted.turn.id, status: TERMINAL_TURNS.has(accepted.turn.status) ? accepted.turn.status : 'processing', at: nowIso(clock) });
  }
  async function reconcile(api) {
    const list = await deliveries();
    for (const item of [...list].reverse()) {
      if (item.direction === 'outbound' && item.status === 'sending') {
        await replaceDelivery({ ...item, status: 'unknown', error: 'telegram_delivery_outcome_unknown' });
        continue;
      }
      if (item.direction !== 'inbound' || !item.turnId || ['delivered', 'failed', 'interrupted'].includes(item.status)) continue;
      let turn;
      try { turn = await context.agents.turns.read(item.turnId); }
      catch { continue; }
      if (!TERMINAL_TURNS.has(turn.status)) { await replaceDelivery({ ...item, status: 'processing' }); continue; }
      if (turn.status !== 'succeeded') { await replaceDelivery({ ...item, status: turn.status, error: turn.error || 'agent_turn_failed' }); continue; }
      await replaceDelivery({ ...item, status: 'succeeded' });
      const answer = String(turn.result?.answerText || '').trim();
      if (!answer) continue;
      const outboundId = `out:${turn.id}`;
      const current = (await deliveries()).find(entry => entry.id === outboundId);
      if (current && ['sending', 'delivered', 'unknown'].includes(current.status)) continue;
      await replaceDelivery({ id: outboundId, direction: 'outbound', chatId: item.chatId, topicId: item.topicId, chatTitle: item.chatTitle, chatType: item.chatType, agentId: item.agentId, turnId: turn.id, status: 'sending', at: nowIso(clock) });
      try {
        let first = true;
        for (const part of chunks(answer)) {
          await api.sendMessage({ chatId: item.chatId, topicId: item.topicId, text: part, replyToMessageId: first ? item.telegramMessageId : null, signal: controller.signal });
          first = false;
        }
        await replaceDelivery({ id: outboundId, status: 'delivered', error: null });
        await replaceDelivery({ ...item, status: 'delivered' });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        await replaceDelivery({ id: outboundId, status: 'unknown', error: publicError(error) });
      }
    }
  }
  async function poll() {
    while (!controller.signal.aborted) {
      const config = await configuration(); const token = await context.secrets.get('telegram-bot-token');
      if (!config.enabled || !token) {
        await serialize(async () => write('transport-state', { ...(await transport()), health: config.enabled && !token ? 'degraded' : 'stopped', polling: 'stopped', error: config.enabled && !token ? 'telegram_token_missing' : null }));
        await wait(idleDelayMs); continue;
      }
      const api = createTelegramApi({ token, fetchImpl });
      try {
        let state = await transport();
        let bot = state.bot;
        if (!bot) {
          const identity = await api.getMe({ signal: controller.signal });
          bot = { id: String(identity.id), username: identity.username || null, displayName: [identity.first_name, identity.last_name].filter(Boolean).join(' ') || null };
          state = { ...state, bot };
        }
        await serialize(() => reconcile(api));
        const updates = await api.getUpdates({ offset: Number(state.offset) || 0, timeout: pollTimeoutSeconds, signal: controller.signal });
        for (const update of Array.isArray(updates) ? updates : []) {
          await serialize(async () => {
            await processMessage(update, bot);
            const latest = await transport();
            await write('transport-state', { ...latest, bot, offset: Math.max(Number(latest.offset) || 0, Number(update.update_id) + 1), health: 'healthy', polling: 'active', lastPollAt: nowIso(clock), error: null });
          });
        }
        if (!updates?.length) await serialize(async () => write('transport-state', { ...(await transport()), bot, health: 'healthy', polling: 'active', lastPollAt: nowIso(clock), error: null }));
      } catch (error) {
        if (controller.signal.aborted) break;
        await serialize(async () => write('transport-state', { ...(await transport()), health: 'degraded', polling: 'retrying', error: publicError(error) }));
        await wait(retryDelayMs);
      }
    }
  }
  async function configure(input) {
    const value = exactObject(input, ['enabled', 'token'], 'configuration_invalid');
    if (typeof value.enabled !== 'boolean') throw Object.assign(new Error('configuration_invalid'), { statusCode: 400 });
    if (value.token !== undefined) await context.secrets.set('telegram-bot-token', boundedString(value.token, 4096, 'telegram_token_invalid'));
    await write('configuration', { enabled: value.enabled });
    if (value.token !== undefined) await write('transport-state', { ...(await transport()), bot: null, error: null });
    wake(); return publicState();
  }
  async function clearToken() {
    await context.secrets.clear('telegram-bot-token');
    await write('configuration', { enabled: false });
    await write('transport-state', { ...(await transport()), bot: null, health: 'stopped', polling: 'stopped', error: null });
    wake(); return publicState();
  }
  async function approve(id, input) {
    const value = exactObject(input, ['agentId'], 'approval_invalid'); const agentId = boundedString(value.agentId, 96, 'approval_invalid');
    await validateAgent(agentId);
    const requests = await pending(); const request = requests.find(item => item.id === id);
    if (!request) throw Object.assign(new Error('pending_admission_not_found'), { statusCode: 404 });
    const approved = await mappings();
    const mapping = { id: request.id, chatId: request.chatId, topicId: request.topicId ?? null, chatTitle: request.chatTitle, chatType: request.chatType, agentId, enabled: true, approvedAt: nowIso(clock) };
    const index = approved.findIndex(item => item.id === mapping.id);
    if (index >= 0) approved[index] = mapping; else approved.unshift(mapping);
    await write('mappings', approved.slice(0, MAX_MAPPINGS));
    await write('pending-admissions', requests.filter(item => item.id !== id));
    return publicState();
  }
  async function deny(id) {
    const requests = await pending();
    if (!requests.some(item => item.id === id)) throw Object.assign(new Error('pending_admission_not_found'), { statusCode: 404 });
    await write('pending-admissions', requests.filter(item => item.id !== id));
    return publicState();
  }
  async function updateMapping(id, input) {
    const value = exactObject(input, ['agentId', 'enabled'], 'mapping_invalid'); const agentId = boundedString(value.agentId, 96, 'mapping_invalid');
    if (typeof value.enabled !== 'boolean') throw Object.assign(new Error('mapping_invalid'), { statusCode: 400 });
    await validateAgent(agentId);
    const approved = await mappings(); const index = approved.findIndex(item => item.id === id);
    if (index < 0) throw Object.assign(new Error('mapping_not_found'), { statusCode: 404 });
    approved[index] = { ...approved[index], agentId, enabled: value.enabled, updatedAt: nowIso(clock) };
    await write('mappings', approved); return publicState();
  }
  function start() { if (!loopPromise) loopPromise = poll().catch(error => context.logger.error('Switchboard poller failed', publicError(error))); return loopPromise; }
  async function close() { controller.abort(new Error('service_shutdown')); wake(); await loopPromise; await queue; }
  return Object.freeze({ start, close, publicState: () => serialize(publicState), configure: input => serialize(() => configure(input)), clearToken: () => serialize(clearToken), approve: (id, input) => serialize(() => approve(id, input)), deny: id => serialize(() => deny(id)), updateMapping: (id, input) => serialize(() => updateMapping(id, input)), processMessage: (update, bot) => serialize(() => processMessage(update, bot)), reconcile: api => serialize(() => reconcile(api)) });
}

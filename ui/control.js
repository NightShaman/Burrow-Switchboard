const styles = `
.switchboard-control{height:100%;min-height:0;overflow:auto;padding:18px;color:var(--text);background:var(--surface);font:13px/1.45 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.switchboard-control *{box-sizing:border-box}.switchboard-control button{font:inherit}.switchboard-control :is(button,a):focus-visible{outline:2px solid var(--accent);outline-offset:2px}.switchboard-control-shell{width:min(1180px,100%);margin:0 auto;display:grid;gap:14px}.switchboard-control-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.switchboard-control-header h1{margin:0;color:var(--text-strong);font-size:22px;line-height:1.2}.switchboard-control-header p{margin:5px 0 0;color:var(--muted)}.switchboard-refresh{min-height:32px;padding:0 12px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--text-strong);cursor:pointer}.switchboard-refresh:hover:not(:disabled){background:var(--surface-hover)}.switchboard-refresh:disabled{cursor:not-allowed;opacity:.55}.switchboard-banner{padding:11px 13px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}.switchboard-banner.warning{border-color:color-mix(in srgb,var(--warning,#eab308) 45%,var(--line));background:color-mix(in srgb,var(--warning,#eab308) 8%,var(--panel))}.switchboard-banner.error{border-color:color-mix(in srgb,var(--danger) 45%,var(--line));background:color-mix(in srgb,var(--danger) 7%,var(--panel));color:var(--danger)}.switchboard-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.switchboard-card{min-width:0;padding:13px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}.switchboard-card-label{margin:0 0 7px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.switchboard-card-value{display:flex;align-items:center;gap:7px;min-width:0;color:var(--text-strong);font-size:15px;font-weight:750}.switchboard-card-value span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.switchboard-card-detail{margin:5px 0 0;color:var(--muted);font-size:11px}.switchboard-dot{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:var(--muted)}.switchboard-dot.good{background:var(--success,#22c55e);box-shadow:0 0 0 3px color-mix(in srgb,var(--success,#22c55e) 14%,transparent)}.switchboard-dot.warn{background:var(--warning,#eab308)}.switchboard-dot.bad{background:var(--danger)}.switchboard-columns{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);gap:14px;align-items:start}.switchboard-section{min-width:0;border:1px solid var(--line);border-radius:8px;background:var(--panel);overflow:hidden}.switchboard-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border-bottom:1px solid var(--line);background:var(--panel-2)}.switchboard-section-head h2{margin:0;color:var(--text-strong);font-size:13px}.switchboard-count{display:inline-grid;min-width:22px;height:20px;place-items:center;padding:0 6px;border-radius:999px;background:var(--accent-subtle);color:var(--accent-strong);font-size:10px;font-weight:800}.switchboard-list{display:grid}.switchboard-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:11px 13px;border-bottom:1px solid var(--line-soft)}.switchboard-row:last-child{border-bottom:0}.switchboard-row-main{min-width:0}.switchboard-row strong,.switchboard-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.switchboard-row strong{color:var(--text-strong)}.switchboard-row small{margin-top:3px;color:var(--muted);font-size:11px}.switchboard-meta{text-align:right;color:var(--muted);font-size:11px;white-space:nowrap}.switchboard-state{display:inline-flex;align-items:center;gap:5px}.switchboard-empty{margin:0;padding:22px 14px;color:var(--muted);text-align:center}.switchboard-help{margin:0;padding:11px 13px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}.switchboard-loading{min-height:220px;display:grid;place-items:center;color:var(--muted)}@media(max-width:900px){.switchboard-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.switchboard-columns{grid-template-columns:1fr}}@media(max-width:560px){.switchboard-control{padding:10px}.switchboard-control-header{align-items:stretch;flex-direction:column}.switchboard-refresh{width:100%}.switchboard-status-grid{grid-template-columns:1fr}.switchboard-row{grid-template-columns:1fr}.switchboard-meta{text-align:left}.switchboard-card-value{font-size:14px}}
`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'className') node.className = value;
    else if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}
function text(value, fallback = '—') { return value === null || value === undefined || value === '' ? fallback : String(value); }
function date(value) { if (!value) return '—'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(); }
function errorMessage(error, fallback) { return error instanceof Error && error.message ? error.message : fallback; }
function normalize(payload) {
  const transport = payload?.transport || {};
  const core = payload?.coreAgentTurns || payload?.core || {};
  return {
    transport: { enabled: transport.enabled === true || payload?.enabled === true, health: text(transport.health, 'unknown'), polling: text(transport.polling, transport.enabled || payload?.enabled ? 'unknown' : 'stopped'), lastPollAt: transport.lastPollAt, error: transport.error },
    bot: payload?.bot || payload?.botIdentity || { configured: payload?.tokenConfigured === true },
    core: { available: core.available === true, reason: core.reason },
    mappings: Array.isArray(payload?.mappings) ? payload.mappings : [],
    pending: Array.isArray(payload?.pending) ? payload.pending : Array.isArray(payload?.pendingAdmissions) ? payload.pendingAdmissions : [],
    deliveries: Array.isArray(payload?.deliveries) ? payload.deliveries : Array.isArray(payload?.recentDeliveries) ? payload.recentDeliveries : [],
  };
}
function tone(value) { const state = String(value || '').toLowerCase(); return ['healthy','active','available','delivered','sent','succeeded','enabled','configured'].includes(state) ? 'good' : ['degraded','pending','queued','processing','unknown'].includes(state) ? 'warn' : 'bad'; }
function statusCard(label, value, detail, status) {
  return el('article', { className: 'switchboard-card' }, el('p', { className: 'switchboard-card-label', text: label }), el('div', { className: 'switchboard-card-value' }, el('span', { className: `switchboard-dot ${tone(status ?? value)}`, 'aria-hidden': 'true' }), el('span', { text: value })), el('p', { className: 'switchboard-card-detail', text: detail }));
}
function section(title, items, render, empty, help = '') {
  const body = el('div', { className: 'switchboard-list' });
  if (items.length) items.forEach(item => body.append(render(item)));
  else body.append(el('p', { className: 'switchboard-empty', text: empty }));
  return el('section', { className: 'switchboard-section' }, el('header', { className: 'switchboard-section-head' }, el('h2', { text: title }), el('span', { className: 'switchboard-count', text: String(items.length), 'aria-label': `${items.length} items` })), body, ...(help ? [el('p', { className: 'switchboard-help', text: help })] : []));
}
function chatLabel(item) { return text(item.chatTitle || item.title || item.chatId, 'Unnamed chat'); }
function topic(item) { return item.topicId !== null && item.topicId !== undefined ? ` · topic ${item.topicId}` : ''; }

export function mountControl({ root, api }) {
  const controller = new AbortController(); let mounted = true; let loading = true; let failure = ''; let state = null;
  const refresh = el('button', { type: 'button', className: 'switchboard-refresh', text: 'Refresh' });
  const shell = el('main', { className: 'switchboard-control' });
  const style = el('style', { text: styles });
  root.replaceChildren(style, shell);
  function render() {
    if (!mounted) return;
    refresh.disabled = loading;
    refresh.textContent = loading ? 'Refreshing…' : 'Refresh';
    const heading = el('header', { className: 'switchboard-control-header' }, el('div', {}, el('h1', { text: 'Switchboard' }), el('p', { text: 'Telegram delivery, approvals, and chat routing at a glance.' })), refresh);
    if (loading && !state) { shell.replaceChildren(el('div', { className: 'switchboard-control-shell' }, heading, el('p', { className: 'switchboard-loading', role: 'status', text: 'Loading Switchboard…' }))); return; }
    if (failure && !state) { shell.replaceChildren(el('div', { className: 'switchboard-control-shell' }, heading, el('p', { className: 'switchboard-banner error', role: 'alert', text: failure }))); return; }
    const { transport, bot, core, mappings, pending, deliveries } = state;
    const botName = bot.username ? `@${String(bot.username).replace(/^@/, '')}` : text(bot.displayName || bot.name, bot.configured === false ? 'Not configured' : 'Configured');
    const status = el('div', { className: 'switchboard-status-grid' },
      statusCard('Transport', transport.enabled ? transport.health : 'disabled', transport.enabled ? 'Telegram long polling enabled' : 'Telegram long polling disabled', transport.enabled ? transport.health : 'stopped'),
      statusCard('Polling', transport.polling, transport.lastPollAt ? `Last poll ${date(transport.lastPollAt)}` : 'No poll recorded', transport.polling),
      statusCard('Telegram bot', botName, bot.id ? `Bot ID ${bot.id}` : bot.configured === false ? 'Add a token in Settings' : 'Sanitized identity', bot.configured === false ? 'stopped' : 'configured'),
      statusCard('Core agent turns', core.available ? 'available' : 'unavailable', core.available ? 'External turns can be dispatched' : text(core.reason, 'Core capability unavailable'), core.available ? 'available' : 'stopped'),
    );
    const mappingsSection = section('Approved mappings', mappings, item => el('article', { className: 'switchboard-row' }, el('div', { className: 'switchboard-row-main' }, el('strong', { text: chatLabel(item) }), el('small', { text: `${text(item.chatType, 'chat')}${topic(item)} · ${text(item.chatId, 'unknown ID')}` })), el('div', { className: 'switchboard-meta' }, el('span', { className: 'switchboard-state' }, el('span', { className: `switchboard-dot ${item.enabled === false ? 'bad' : 'good'}`, 'aria-hidden': 'true' }), document.createTextNode(item.enabled === false ? 'Disabled' : text(item.agentName || item.agentId, 'Enabled'))))), 'No approved chat mappings.', 'Direct chats route every approved message. Group chats route only bot mentions and replies to the bot.');
    const pendingSection = section('Pending admissions', pending, item => el('article', { className: 'switchboard-row' }, el('div', { className: 'switchboard-row-main' }, el('strong', { text: chatLabel(item) }), el('small', { text: `${text(item.chatType, 'chat')}${topic(item)} · requested ${date(item.requestedAt)}` })), el('div', { className: 'switchboard-meta', text: text(item.requester?.name || item.requester || item.requesterUsername, 'Awaiting review') })), 'No chats are waiting for approval.');
    const deliveriesSection = section('Recent deliveries', deliveries, item => el('article', { className: 'switchboard-row' }, el('div', { className: 'switchboard-row-main' }, el('strong', { text: `${item.direction === 'outbound' ? 'To' : 'From'} ${chatLabel(item)}` }), el('small', { text: `${text(item.agentName || item.agentId, 'Unassigned agent')} · ${date(item.at || item.createdAt || item.updatedAt)}` })), el('div', { className: 'switchboard-meta' }, el('span', { className: 'switchboard-state' }, el('span', { className: `switchboard-dot ${tone(item.status)}`, 'aria-hidden': 'true' }), document.createTextNode(text(item.status, 'unknown'))))), 'No deliveries recorded yet.');
    const banners = [];
    if (failure) banners.push(el('p', { className: 'switchboard-banner error', role: 'alert', text: failure }));
    if (transport.error) banners.push(el('p', { className: 'switchboard-banner warning', text: `Telegram transport: ${transport.error}` }));
    if (!core.available) banners.push(el('p', { className: 'switchboard-banner warning', text: `New messages cannot reach agents: ${text(core.reason, 'Core external agent turns are unavailable.')}` }));
    shell.replaceChildren(el('div', { className: 'switchboard-control-shell' }, heading, ...banners, status, el('div', { className: 'switchboard-columns' }, mappingsSection, pendingSection), deliveriesSection));
  }
  async function load() {
    loading = true; failure = ''; render();
    try { state = normalize(await api('/bootstrap', { signal: controller.signal })); }
    catch (error) { if (!mounted || controller.signal.aborted) return; failure = errorMessage(error, 'Could not load Switchboard.'); }
    finally { if (mounted) { loading = false; render(); } }
  }
  refresh.addEventListener('click', load); void load();
  return () => { mounted = false; controller.abort(); refresh.removeEventListener('click', load); root.replaceChildren(); };
}

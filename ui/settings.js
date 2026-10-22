export const settingsSections = Object.freeze([
  { id: 'configuration', label: 'Configuration' },
  { id: 'pending-admissions', label: 'Pending admissions' },
  { id: 'chat-mappings', label: 'Chat mappings' },
]);

const styles = `
.switchboard-settings{display:grid;gap:14px}.switchboard-settings *{box-sizing:border-box}.switchboard-settings :is(input,select,button){font:inherit}.switchboard-settings :is(input:not([type=checkbox]),select){width:100%;min-height:34px;padding:0 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface-input);color:var(--text)}.switchboard-settings :is(input,select,button):focus-visible{outline:2px solid var(--accent);outline-offset:2px}.switchboard-fields{display:grid;gap:12px}.switchboard-field{display:grid;gap:5px;color:var(--text-strong);font-weight:650}.switchboard-field small{color:var(--muted);font-weight:400}.switchboard-toggle{display:flex;align-items:flex-start;gap:9px;padding:11px 12px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--text)}.switchboard-toggle input{flex:0 0 auto;margin-top:3px;accent-color:var(--accent)}.switchboard-toggle span{display:grid;gap:2px}.switchboard-toggle strong{color:var(--text-strong)}.switchboard-toggle small{color:var(--muted)}.switchboard-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--line-soft)}.switchboard-actions>div{display:flex;gap:8px}.switchboard-settings button{min-height:32px;padding:0 11px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--text-strong);cursor:pointer}.switchboard-settings button:hover:not(:disabled){background:var(--surface-hover)}.switchboard-settings button.primary{border-color:var(--accent);background:var(--accent-subtle);color:var(--accent-strong)}.switchboard-settings button.danger{border-color:color-mix(in srgb,var(--danger) 45%,var(--line));color:var(--danger)}.switchboard-settings button:disabled{cursor:not-allowed;opacity:.52}.switchboard-feedback{margin:0;color:var(--muted);font-size:12px}.switchboard-feedback.error{color:var(--danger)}.switchboard-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.switchboard-summary div{padding:10px;border:1px solid var(--line);border-radius:7px;background:var(--panel)}.switchboard-summary strong,.switchboard-summary small{display:block;overflow:hidden;text-overflow:ellipsis}.switchboard-summary strong{color:var(--text-strong)}.switchboard-summary small{margin-top:2px;color:var(--muted);font-size:10px}.switchboard-list{display:grid;gap:8px}.switchboard-item{display:grid;gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:7px;background:var(--panel)}.switchboard-item-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.switchboard-item-head strong,.switchboard-item-head small{display:block}.switchboard-item-head strong{color:var(--text-strong)}.switchboard-item-head small{margin-top:2px;color:var(--muted);font-size:11px}.switchboard-item-meta{color:var(--muted);font-size:11px;text-align:right}.switchboard-item-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px}.switchboard-mapping-controls{grid-template-columns:minmax(0,1fr) auto auto}.switchboard-empty{margin:0;padding:20px;color:var(--muted);text-align:center}.switchboard-settings-note{margin:0;color:var(--muted);font-size:11px}.switchboard-destructive{padding:12px;border:1px solid color-mix(in srgb,var(--danger) 30%,var(--line));border-radius:7px;background:color-mix(in srgb,var(--danger) 5%,var(--panel))}.switchboard-destructive strong{display:block;color:var(--text-strong)}.switchboard-destructive p{margin:3px 0 10px;color:var(--muted);font-size:11px}@media(max-width:650px){.switchboard-summary{grid-template-columns:1fr}.switchboard-item-controls,.switchboard-mapping-controls{grid-template-columns:1fr}.switchboard-item-controls button{width:100%}.switchboard-actions{align-items:stretch;flex-direction:column}.switchboard-actions>div{display:grid}.switchboard-actions button{width:100%}.switchboard-item-head{flex-direction:column}.switchboard-item-meta{text-align:left}}
`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'className') node.className = value;
    else if (name === 'text') node.textContent = value;
    else if (name === 'htmlFor') node.htmlFor = value;
    else node.setAttribute(name, value);
  }
  node.append(...children); return node;
}
function message(error, fallback) { return error instanceof Error && error.message ? error.message.replaceAll('_', ' ') : fallback; }
function label(item) { return String(item?.chatTitle || item?.title || item?.chatId || 'Unnamed chat'); }
function topic(item) { return item?.topicId !== null && item?.topicId !== undefined ? ` · topic ${item.topicId}` : ''; }
function date(value) { if (!value) return '—'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(); }
function normalize(value) {
  const transport = value?.transport || {};
  const core = value?.coreAgentTurns || value?.core || {};
  return { enabled: value?.enabled === true || transport.enabled === true, tokenConfigured: value?.tokenConfigured === true || value?.bot?.configured === true, bot: value?.bot || value?.botIdentity || {}, transport, core: { available: core.available === true, reason: core.reason }, mappings: Array.isArray(value?.mappings) ? value.mappings : [], pending: Array.isArray(value?.pending) ? value.pending : Array.isArray(value?.pendingAdmissions) ? value.pendingAdmissions : [] };
}
function agentOptions(agents, selected = '') {
  return [{ id: '', name: 'Select an agent' }, ...agents.filter(agent => agent.enabled !== false).map(agent => ({ id: String(agent.id), name: String(agent.name || agent.id) }))].map(agent => { const option = el('option', { value: agent.id, text: agent.name }); option.selected = agent.id === selected; return option; });
}
function request(api, controller, path, init = {}) { return api(path, { ...init, signal: controller.signal, headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) } }); }

export function mountSettings({ section, primary, agents = [], api }) {
  if (!settingsSections.some(item => item.id === section)) return;
  const controller = new AbortController(); let mounted = true; let loading = true; let busy = false; let failed = ''; let feedback = ''; let state = null;
  const panel = el('section', { className: 'setting-section switchboard-settings', 'aria-labelledby': `switchboard-${section}-heading` });
  const style = el('style', { text: styles }); primary.replace([style, panel]);
  const setFeedback = (value, error = false) => { feedback = value; failed = error ? value : ''; render(); };
  async function load(success = '') {
    loading = true; failed = ''; feedback = ''; render();
    try { state = normalize(await request(api, controller, '/configuration')); feedback = success; }
    catch (error) { if (!mounted || controller.signal.aborted) return; failed = message(error, 'Could not load Switchboard configuration.'); }
    finally { if (mounted) { loading = false; busy = false; render(); } }
  }
  async function mutate(path, init, success) {
    busy = true; failed = ''; feedback = ''; render();
    try { await request(api, controller, path, init); if (!mounted) return; await load(success); }
    catch (error) { if (!mounted || controller.signal.aborted) return; busy = false; setFeedback(message(error, 'The change could not be saved.'), true); }
  }
  function heading(title, description) { return [el('h2', { id: `switchboard-${section}-heading`, text: title }), el('p', { className: 'settings-description', text: description })]; }
  function feedbackNode() { return failed ? el('p', { className: 'switchboard-feedback error', role: 'alert', text: failed }) : feedback ? el('p', { className: 'switchboard-feedback', role: 'status', 'aria-live': 'polite', text: feedback }) : null; }
  function renderConfiguration() {
    const enabled = el('input', { id: 'switchboard-enabled', type: 'checkbox' }); enabled.checked = state.enabled; enabled.disabled = busy;
    const token = el('input', { id: 'switchboard-token', type: 'password', autocomplete: 'new-password', maxlength: '4096', placeholder: state.tokenConfigured ? 'Leave blank to keep the current token' : 'Paste Telegram bot token' }); token.disabled = busy;
    const save = el('button', { type: 'submit', className: 'primary', text: busy ? 'Saving…' : 'Save configuration' }); save.disabled = busy;
    const form = el('form', { className: 'switchboard-fields' }, el('label', { className: 'switchboard-toggle' }, enabled, el('span', {}, el('strong', { text: 'Enable Telegram polling' }), el('small', { text: 'Switchboard receives Telegram updates only while this is enabled.' }))), el('label', { className: 'switchboard-field', htmlFor: token.id }, document.createTextNode('Bot token'), token, el('small', { text: state.tokenConfigured ? 'A token is configured. Leave blank to preserve it, or enter a replacement.' : 'Write-only. The saved token is never returned to this page.' })), el('div', { className: 'switchboard-summary' }, el('div', {}, el('strong', { text: state.bot.username ? `@${String(state.bot.username).replace(/^@/, '')}` : state.tokenConfigured ? 'Configured' : 'Not configured' }), el('small', { text: 'Telegram bot' })), el('div', {}, el('strong', { text: String(state.transport.health || (state.enabled ? 'unknown' : 'stopped')) }), el('small', { text: 'Transport' })), el('div', {}, el('strong', { text: state.core.available ? 'Available' : 'Unavailable' }), el('small', { text: state.core.available ? 'Core agent turns' : String(state.core.reason || 'Core agent turns') }))), ...(feedbackNode() ? [feedbackNode()] : []), el('div', { className: 'switchboard-actions' }, el('p', { className: 'switchboard-settings-note', text: 'Direct chats route every approved message. Groups route only mentions of, or replies to, the bot.' }), el('div', {}, save)));
    form.addEventListener('submit', event => { event.preventDefault(); if (!form.reportValidity()) return; const body = { enabled: enabled.checked }; if (token.value.trim()) body.token = token.value.trim(); void mutate('/configuration', { method: 'PUT', body: JSON.stringify(body) }, 'Configuration saved.'); });
    const clear = el('button', { type: 'button', className: 'danger', text: busy ? 'Clearing…' : 'Clear configured token' }); clear.disabled = busy || !state.tokenConfigured;
    clear.addEventListener('click', () => { if (!confirm('Clear the Telegram bot token? Polling will stop until a new token is saved.')) return; void mutate('/configuration/token/clear', { method: 'POST' }, 'Telegram bot token cleared.'); });
    panel.replaceChildren(...heading('Switchboard configuration', 'Connect a Telegram bot and control long polling.'), form, el('div', { className: 'switchboard-destructive' }, el('strong', { text: 'Remove bot credential' }), el('p', { text: 'This explicit destructive action clears the saved token. Blank token fields never clear it.' }), clear));
  }
  function renderPending() {
    const list = el('div', { className: 'switchboard-list' });
    if (!state.pending.length) list.append(el('p', { className: 'switchboard-empty', text: 'No chats are waiting for approval.' }));
    for (const item of state.pending) {
      const select = el('select', { 'aria-label': `Agent for ${label(item)}` }, ...agentOptions(agents)); select.disabled = busy;
      const approve = el('button', { type: 'button', className: 'primary', text: 'Approve' }); const deny = el('button', { type: 'button', className: 'danger', text: 'Deny' }); approve.disabled = busy; deny.disabled = busy;
      approve.addEventListener('click', () => { if (!select.value) { select.setCustomValidity?.('Choose an agent.'); select.reportValidity?.(); return; } select.setCustomValidity?.(''); void mutate(`/pending/${encodeURIComponent(item.id)}/approve`, { method: 'POST', body: JSON.stringify({ agentId: select.value }) }, `${label(item)} approved.`); });
      deny.addEventListener('click', () => { if (!confirm(`Deny “${label(item)}”?`)) return; void mutate(`/pending/${encodeURIComponent(item.id)}/deny`, { method: 'POST' }, `${label(item)} denied.`); });
      list.append(el('article', { className: 'switchboard-item' }, el('div', { className: 'switchboard-item-head' }, el('div', {}, el('strong', { text: label(item) }), el('small', { text: `${String(item.chatType || 'chat')}${topic(item)} · ${String(item.chatId || 'unknown ID')}` })), el('span', { className: 'switchboard-item-meta', text: `Requested ${date(item.requestedAt)}` })), el('div', { className: 'switchboard-item-controls' }, select, el('div', {}, approve, document.createTextNode(' '), deny))));
    }
    panel.replaceChildren(...heading('Pending admissions', 'Approve a Telegram chat and choose the Burrow agent that will receive its messages.'), ...(feedbackNode() ? [feedbackNode()] : []), list);
  }
  function renderMappings() {
    const list = el('div', { className: 'switchboard-list' });
    if (!state.mappings.length) list.append(el('p', { className: 'switchboard-empty', text: 'No approved chat mappings.' }));
    for (const item of state.mappings) {
      const select = el('select', { 'aria-label': `Agent for ${label(item)}` }, ...agentOptions(agents, String(item.agentId || ''))); select.value = String(item.agentId || ''); select.disabled = busy;
      const enabled = el('input', { type: 'checkbox', 'aria-label': `Enable ${label(item)}` }); enabled.checked = item.enabled !== false; enabled.disabled = busy;
      const save = el('button', { type: 'button', className: 'primary', text: 'Save' }); save.disabled = busy;
      save.addEventListener('click', () => { if (!select.value) { select.setCustomValidity?.('Choose an agent.'); select.reportValidity?.(); return; } select.setCustomValidity?.(''); void mutate(`/mappings/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify({ agentId: select.value, enabled: enabled.checked }) }, `${label(item)} updated.`); });
      list.append(el('article', { className: 'switchboard-item' }, el('div', { className: 'switchboard-item-head' }, el('div', {}, el('strong', { text: label(item) }), el('small', { text: `${String(item.chatType || 'chat')}${topic(item)} · ${String(item.chatId || 'unknown ID')}` })), el('span', { className: 'switchboard-item-meta', text: item.enabled === false ? 'Disabled' : 'Enabled' })), el('div', { className: 'switchboard-item-controls switchboard-mapping-controls' }, select, el('label', { className: 'switchboard-toggle' }, enabled, el('span', {}, el('strong', { text: 'Enabled' }), el('small', { text: 'Disable instead of deleting' }))), save)));
    }
    panel.replaceChildren(...heading('Chat mappings', 'Route approved Telegram chats to one enabled Burrow agent.'), el('p', { className: 'switchboard-settings-note', text: 'Direct chats route every message. In groups, only bot mentions and replies to the bot are routed.' }), ...(feedbackNode() ? [feedbackNode()] : []), list);
  }
  function render() {
    if (!mounted) return;
    if (loading && !state) { panel.replaceChildren(...heading('Switchboard', 'Loading configuration and chat routing…'), el('p', { className: 'switchboard-empty', role: 'status', text: 'Loading…' })); return; }
    if (failed && !state) { const retry = el('button', { type: 'button', text: 'Retry' }); retry.addEventListener('click', () => void load()); panel.replaceChildren(...heading('Switchboard', 'Configuration is unavailable.'), feedbackNode(), retry); return; }
    if (section === 'configuration') renderConfiguration(); else if (section === 'pending-admissions') renderPending(); else renderMappings();
  }
  void load();
  return () => { mounted = false; controller.abort(); panel.remove(); style.remove(); };
}

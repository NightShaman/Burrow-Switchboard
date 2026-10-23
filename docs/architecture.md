# Architecture and Core contract

## Boundaries

`server/index.mjs` activates one service, registers legacy and connection-scoped operator routes and returns an asynchronous cleanup function. `server/connections.mjs` owns the persisted registry, connection lifecycle and scoped stores. `server/telegram.mjs` contains Telegram API transport, settings-backed state, routing/admission, polling and reply reconciliation. `ui/settings.js` implements the four host Settings sections.

```text
Telegram message update
  → chat/topic admission and addressed-message checks
  → Core agents.turns.submit (agent, session, message, idempotency key)
  → saved inbound delivery and turn ID
  → later Core agents.turns.read
  → completed answerText
  → saved outbound sending record
  → Telegram sendMessage
  → delivered or unknown
```

Switchboard does not directly call a model provider or run a parallel tool loop. It submits a real agent turn to Core. The transport boundary is deliberately narrow, but a second provider is future work, not an implemented configurable adapter.

## Host capabilities

The service requires `context.settings`, `context.secrets` and `context.agents`. Public state lists agents; approval and mapping edits require an existing enabled agent. External execution requires:

```js
const accepted = await context.agents.turns.submit({
  agentId: mapping.agentId,
  sessionId: `telegram:${chatId}:${topicId ?? 'root'}`,
  message: '[Telegram message from … in …]\n\n' + text,
  idempotencyKey: `telegram-update-${updateId}`,
});
const turn = await context.agents.turns.read(accepted.turn.id);
```

The actual session string is bounded to 128 characters. `submit` returns an accepted turn record; it is not an immediate answer. Reconciliation recognizes `succeeded`, `failed` and `interrupted` as terminal. Successful reply text is taken from `turn.result.answerText`.

If submit/read are absent, valid routed input is recorded as failed with `core_external_agent_turns_unavailable`. Approval itself does not establish that Core turns are available.

## Multiple bot connections

Settings `connections` stores `{id, name, botId}` records, never credentials. The original `default` connection retains its original keys and Core identities in place; new UUID connections prefix every settings/secret key with `connection-<id>-`. Each runs its own abortable poller and serialized delivery queue. Registry/configuration mutations are serialized separately; one long poll does not block other bots.

New connections use session `telegram:<connectionId>:<chatId>:<topicId-or-root>` and idempotency key `telegram-<connectionId>-update-<updateId>`. Default preserves the old forms shown above. Local route/delivery IDs can match across bots because their stores are isolated. Token validation binds a connection to a Telegram bot ID, rejects duplicate bots and prevents retained routes/replies moving to a different bot.

Configuration invalidates network work before draining the worker queue and blocks new polling during persistence. Interrupted sends remain ambiguous and are not blindly retried. Already-sent provider work cannot be recalled, and Core turns are not canceled by disabling/removing a connection.

## Stored state

| Host store key | Contents |
| --- | --- |
| Settings `configuration` | Polling enabled flag |
| Settings `transport-state` | Health, polling state, last poll time, sanitized error, Telegram offset and cached bot identity |
| Settings `mappings` | Up to 250 approved chat/topic → agent mappings |
| Settings `pending-admissions` | Up to 100 admission requests |
| Settings `deliveries` | Up to 200 combined recent inbound/outbound records per connection |
| Secret `telegram-bot-token` | Bot credential; never part of public state |

Mapping IDs are the first 24 hex characters of SHA-256 over `telegram:<chatId>:<topicId-or-root>`. Inbound delivery IDs are `in:<updateId>`; outbound IDs are `out:<turnId>`.

Mutations and message/reconciliation operations share a serialized promise queue. Configuration changes increment a poll generation; stale batches are checked against generation, enabled state and current token before processing. An AbortController handles service shutdown. These mechanisms reduce races; they do not make Telegram and Core one transactional system.

## Security and reliability boundaries

The host supplies operator authentication and secret persistence. API responses use `Cache-Control: no-store`; token presence and sanitized bot identity are exposed, not the token itself. Settings rendering uses text nodes rather than interpreting incoming chat metadata as HTML.

Admission controls the route, not each participant or every requested action. Core remains responsible for agent execution and its applicable tool/approval policies. Keep powerful agents out of broadly shared chats unless that access is intentional.

Persistent offsets plus Core idempotency and outbound state support restart recovery. Unknown sends are intentionally suppressed rather than retried. Bounded collections and absent replay controls mean this is not an exactly-once, lossless messaging service. See [operations](operations.md) before extending delivery behavior.

# Architecture and Core contract

## Boundaries

`server/index.mjs` activates one service, registers legacy and connection-scoped operator routes and returns an asynchronous cleanup function. `server/connections.mjs` owns the persisted registry, connection lifecycle and scoped stores. `server/telegram.mjs` contains Telegram API transport, settings-backed state, routing/admission, polling and reply reconciliation. `server/discord.mjs` contains Discord Gateway/REST, DM/channel/thread admissions, durable deliveries and bounded guild-channel context. `server/room-history.mjs` owns the shared, bounded group/topic context store and reply attribution. `ui/settings.js` implements the four host Settings sections.

```text
Telegram message update
  → chat/topic admission
  → record approved group human text in shared room history
  → addressed-message checks and bounded room/quoted-reply context
  → Core agents.turns.submit (agent, session, message, idempotency key)
  → saved inbound delivery and turn ID
  → later Core agents.turns.read
  → completed answerText
  → saved outbound sending record
  → Telegram sendMessage
  → record Telegram-confirmed reply chunks in shared room history
  → delivered or unknown
```

Switchboard does not directly call a model provider or run a parallel tool loop. It submits a real agent turn to Core. Telegram and Discord are implemented behind separate workers with a shared connection registry; neither requires a new Core capability or Tutor integration.

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

The example shows the migrated Telegram default. New Telegram connections prefix connection ID; Discord uses `discord:<connectionId>:<channelId>` (Discord IDs are strings) and `discord-<connectionId>-message-<messageId>` as its Core idempotency key. The actual Telegram session string is bounded to 128 characters. `submit` returns an accepted turn record; it is not an immediate answer. Reconciliation recognizes `succeeded`, `failed` and `interrupted` as terminal. Successful reply text is taken from `turn.result.answerText`.

If submit/read are absent, valid routed input is recorded as failed with `core_external_agent_turns_unavailable`. Approval itself does not establish that Core turns are available.

## Multiple bot connections

Settings `connections` stores `{id, name, transport, botId}` records (`transport` is `telegram` or `discord`; absent legacy values mean `telegram`), never credentials. The original `default` connection retains its original keys and Core identities in place; new UUID connections prefix every settings/secret key with `connection-<id>-`. Each runs its own abortable Telegram poller or Discord Gateway worker and serialized delivery queue. Transport is immutable after creation. Registry/configuration mutations are serialized separately; one long poll does not block other bots.

New connections use session `telegram:<connectionId>:<chatId>:<topicId-or-root>` and idempotency key `telegram-<connectionId>-update-<updateId>`. Default preserves the old forms shown above. Local route/delivery IDs can match across bots because their stores are isolated. Provider token validation binds a connection to a bot ID, rejects duplicate bots and prevents retained routes/replies moving to a different bot.

Configuration invalidates network work before draining the worker queue and blocks new polling during persistence. Interrupted sends remain ambiguous and are not blindly retried. Already-sent provider work cannot be recalled, and Core turns are not canceled by disabling/removing a connection.

## Stored state

| Host store key | Contents |
| --- | --- |
| Settings `configuration` | Telegram polling or Discord gateway enabled flag |
| Settings `transport-state` | Health, polling state, last poll time, sanitized error, cached bot identity, and provider-specific cursor/gateway state |
| Settings `mappings` | Up to 250 approved chat/topic or channel/thread → agent mappings |
| Settings `pending-admissions` | Up to 100 admission requests |
| Settings `deliveries` | Up to 200 combined recent inbound/outbound records per connection |
| Settings `telegram-room-history` (mod-wide, not connection-prefixed) | Up to 100 chat/topic rooms, 50 messages each, 512,000 UTF-8 JSON bytes total; see [routing](routing.md#shared-group-and-channel-conversation-context) |
| Settings `discord-room-history` (mod-wide) | Bounded guild/channel history shared across approved Discord bots; thread IDs are separate rooms; DMs connection-isolated |
| Secret `telegram-bot-token` or `discord-bot-token` (connection-scoped) | Provider bot credential; never part of public state |

Telegram mapping IDs are the first 24 hex characters of SHA-256 over `telegram:<chatId>:<topicId-or-root>`; Discord mapping IDs hash `discord:<guildId-or-dm>:<channelId>`. Inbound delivery IDs use `in:<updateId>` (Telegram) or `in:<messageId>` (Discord); outbound IDs are `out:<turnId>`.

Mutations and message/reconciliation operations share a serialized promise queue. Configuration changes increment a poll generation; stale batches are checked against generation, enabled state and current token before processing. An AbortController handles service shutdown. Discord additionally uses Gateway sequence/heartbeat/resume, periodic reconciliation and REST message write-ahead state. These mechanisms reduce races; they do not make either provider and Core one transactional system.

## Security and reliability boundaries

The host supplies operator authentication and secret persistence. API responses use `Cache-Control: no-store`; token presence and sanitized bot identity are exposed, not the token itself. Settings rendering uses text nodes rather than interpreting incoming chat metadata as HTML.

Admission controls the route, not each participant or every requested action. Core remains responsible for agent execution and its applicable tool/approval policies. Keep powerful agents out of broadly shared chats unless that access is intentional.

Persistent Telegram offsets or Discord Gateway reconnection plus Core idempotency and outbound state support restart recovery. Unknown sends are intentionally suppressed rather than retried. Bounded collections and absent replay controls mean this is not an exactly-once, lossless messaging service. See [operations](operations.md) before extending delivery behavior.


## Shared context boundary

The registry shares a mod-wide Telegram room-history store between its Telegram
workers and a separate mod-wide `discord-room-history` store between Discord
workers. Serialized persistence prevents lost updates across workers. Only Telegram
group/supergroup chat+topic identities share Telegram context; Discord shares per
guild+channel across approved bots. A thread is a separate channel room and does
not inherit its parent history; DMs are connection-isolated. Credentials, polling
cursors or gateway sessions, admissions, Core execution sessions and outboxes stay
scoped to each connection.

Successfully posted answer chunks enter shared history after provider confirmation,
not merely Core success. Failed/unknown sends do not manufacture room text. A crash
between provider acknowledgment and history persistence can leave a visible message
absent from bounded context; no blind resend is attempted.

No new Core capability or Tutor integration is needed: existing settings
persistence and external-turn submission carry the context. Full submissions are
frozen before Core submission and reused if acceptance is uncertain. They are
never exposed in public delivery diagnostics. Shared context never invokes a peer
agent, so no automatic bot-to-bot wake loop is introduced.

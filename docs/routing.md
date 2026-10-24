# Admission and routing

## Admission is per connection and room

Within each Telegram bot connection, the route identity combines chat ID and optional topic ID; for Discord each DM/channel/thread is identified by its channel ID (and guild ID for guild routes). Admissions, mappings and limits are independent across connections. A direct chat, a group's root route and each forum topic or a Discord channel and its threads have distinct keys. The displayed title is descriptive metadata, not the identity or a security boundary.

A nonempty accepted text message from an unknown Telegram route, or a nonempty human text message from an unknown Discord route, creates or refreshes a pending entry with chat/topic or channel/thread information, requester identity and request time. No Core turn is submitted. Pending admission is bounded to 100 entries; it is not a permanent request archive.

**Approve** requires an existing enabled agent. It creates an enabled mapping and removes the pending entry. The triggering message is not queued: send a new message after approval.

**Deny** removes the current request. It is **not a permanent ban**; later text from that unknown route can create another request.

## Approved routing rules

| Route | Text forwarded |
| --- | --- |
| Telegram direct chat | Nonempty `message.text` |
| Telegram group or other non-direct mapping | Text containing a Telegram `mention` entity matching the bot username, or a reply whose original sender is the bot |
| Telegram forum topic | Same addressed-message rule, scoped to its own mapping |
| Discord DM | Every approved nonempty human text message |
| Discord guild channel or thread | Human text mentioning the selected bot or replying to its message |
| Disabled mapping | Nothing; it does not return to pending admissions |

For Telegram, only `update.message` with text is processed. Messages with `from.is_bot` are ignored unless Telegram also supplies `sender_chat`; that field represents the speaking chat. Switchboard records its own confirmed bot replies directly into room context rather than treating those replies as new requests. Media, captions without text, edited-message updates and channel-post updates are not supported by this implementation. A helper can label a chat “channel”; that is not a channel-post transport implementation.

Discord handles `MESSAGE_CREATE` text via Gateway; attachments, voice and streaming are not supported. Native slash commands arrive separately as interactions; see [Discord commands](discord.md#native-slash-commands). Discord bot/webhook senders cannot create admissions or trigger turns; on approved routes their text may contribute context. Guild channel/thread text from humans without a mention/reply is context only. Threads do not inherit parent-channel approval. Discord delivery (including Message Content intent and channel/thread permissions) is a separate gate; see [setup](discord.md).

Telegram delivery is a separate gate: admin status or disabled privacy does not bypass this table. A targeted `/start@BotUsername` command can request admission if delivered, but is not itself a supported post-approval agent trigger. Follow the [group setup checklist](setup.md#groups-and-forum-topics) for command syntax, privacy, permissions and multiple bots.

On Telegram the first matching bot mention is removed from non-direct text; on Discord bot mention markup is removed from addressed guild text. The remaining text must be nonempty. Merely putting an `@name` string in synthetic input without Telegram's mention entity does not satisfy that check. Replies to the bot need not contain a mention.

Messages receive a short transport-specific sender/room prefix before Core submission. This is conversational context, not verified authorization for actions described in the text.

## Sessions and agent changes

The migrated default connection keeps session ID `telegram:<chatId>:<topicId-or-root>`. New connections use `telegram:<connectionId>:<chatId>:<topicId-or-root>` so each agent keeps its own execution history. Discord initially uses `discord:<connectionId>:<channelId>` (IDs remain strings) for each mapped DM/channel/thread. `/new` replaces this with an owner-bound Core session and sets a room-history boundary; `/model` changes that owned session’s selection. Old sessions remain, but pre-reset room history/quotes and late old replies are not injected into the new conversation. Approved group/topic and Discord guild-channel/thread mappings additionally receive bounded shared room context described below; DMs remain connection-isolated. All participants in an approved group/topic share that route's session for the selected agent. Switchboard does not create a private session per participant.

In **Chat Mappings**, select an enabled agent and save to redirect subsequent messages. Telegram’s route-derived session ID does not change when the agent selection changes. Discord clears any owned-session binding when changing the agent; subsequent messages use the new agent’s deterministic route session until `/new` creates another owned session. Do not describe this as a conversation wipe or a migration of one agent's history into another; session/history handling belongs to Core.

Uncheck **Enabled** and save to stop new messages on that route. The mapping remains visible and can be re-enabled. The **Delete** action removes only the selected connection's mapping, not the provider chat or other bots' mappings, and interrupts its outstanding replies. Later text can request admission again. This is not a permanent provider ban, a history wipe, or cancellation of Core work already submitted. Mapping updates validate the selected agent even when disabling, so choose an existing enabled agent if a formerly selected agent has been disabled or removed.

## Limits and duplicate handling

Per connection, there are at most 250 stored mappings, 100 pending admissions and 200 recent delivery records (inbound and outbound together). New pending requests, mappings and Telegram delivery entries can evict older entries. Discord delivery storage instead removes completed non-unknown entries to make room; it refuses growth with `discord_backlog_full` if unresolved/unknown entries fill the 200-record ledger or serialized delivery state exceeds 4,000,000 bytes. These bounded settings collections are not an unlimited queue or audit ledger.

The default connection preserves Core idempotency key `telegram-update-<update_id>`; new connections use `telegram-<connectionId>-update-<update_id>` to prevent cross-bot collisions. Discord uses `discord-<connectionId>-message-<messageId>`; Gateway resume/heartbeat and durable delivery state support reconnection, but are not exactly-once messaging. Telegram polling persists the next offset after processing an update. Core owns the durable idempotency contract; Switchboard also records inbound turns and outbound outcomes. This is duplicate suppression, not an unconditional exactly-once delivery guarantee. See [operations](operations.md#delivery-states-and-uncertain-outcomes).


## Shared group and channel conversation context

Enabled, approved group/supergroup mappings in the **same Telegram chat and topic**
share a bounded conversation record across managed bot connections. Switchboard
records human text before checking whether it addresses that bot. Successfully
posted agent reply chunks enter the same record with bot, connection and agent
attribution. Ordinary Telegram bot delivery does not guarantee peer bot messages; this internal
record supplies that missing visibility.

**Visibility is not a trigger.** An addressed mention or reply to the selected bot
submits a turn on approved Telegram non-direct routes; on Discord these triggers
must come from a human, never a bot or webhook. Unaddressed human messages and peer replies are context for the
next addressed turn, not additional turns. Two bots mentioned simultaneously can
answer concurrently; neither is promised visibility of an answer not yet posted
when its turn was submitted. Wait for one answer before asking the other to react.

Quoted replies include original speaker, message ID and available original text
(or caption), plus any selected quote excerpt. Known room messages carry reply IDs
when available. Quotes are also supplied in direct chats, without sharing those
private conversations. Context is explicitly labeled as quoted conversation data,
not new operator instructions.

The shared record is persisted in mod settings, deduplicated by Telegram message
ID and ordered by that ID. Limits: 100 recently active rooms, 50 messages per room,
4,000 UTF-16 units per message without splitting surrogate pairs, 512,000 serialized
UTF-8 bytes overall, and 16,000 UTF-8 bytes of room-history JSON per submission.
Older context can be evicted. The current message is supplied separately and is
not duplicated in history; later messages are not included in an earlier turn.

Only approved, enabled routes contribute inbound history. An approved route in a
room joins that room's retained context, including messages recorded by other
approved connections before it joined. Disabling/deleting a mapping stops new
input via that route but does not erase shared room history or existing Core
session history. Re-admission can see retained room history. Direct chats, other
chat IDs and other topic IDs never join that record. This is not a history wipe or
an unlimited Telegram archive; messages Telegram did not deliver cannot be recovered.

Discord independently persists bounded shared history per guild+channel (a thread ID is its own channel room) across approved bots. Discord DMs use connection-isolated history; no parent/thread or cross-guild context merge. On approved guild routes, human text and observed bot/webhook text can be context, while only a human mention/reply to the selected bot starts a turn. Posted bot answers enter history after confirmed REST sends. Only past bounded entries are submitted to Core, as quoted data rather than instructions; the current message is separate. Discord room limits are 100 rooms, 50 messages per room, 4,000 UTF-16 units per message, 512,000 serialized UTF-8 bytes total, and 16,000 UTF-8 bytes of context per submission. DMs do not share across bot connections.

The complete submission is frozen before calling Core so an uncertain submission
can replay the exact same input after restart even if room history changes. These
pending inputs are internal state and are omitted from public delivery diagnostics.
As with delivery history, the 200-record connection limit still bounds recovery.


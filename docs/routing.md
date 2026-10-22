# Admission and routing

## Admission is per chat and topic

The route identity combines Telegram chat ID and optional topic ID. A direct chat, a group's root route and each forum topic have distinct keys. The displayed title is descriptive metadata, not the identity or a security boundary.

A nonempty text message from an unknown route creates or refreshes a pending entry with chat/topic information, requester identity and request time. No Core turn is submitted. Pending admission is bounded to 100 entries; it is not a permanent request archive.

**Approve** requires an existing enabled agent. It creates an enabled mapping and removes the pending entry. The triggering message is not queued: send a new message after approval.

**Deny** removes the current request. It is **not a permanent ban**; later text from that unknown route can create another request.

## Approved routing rules

| Route | Text forwarded |
| --- | --- |
| Direct chat | Nonempty `message.text` |
| Group or other non-direct mapping | Text containing a Telegram `mention` entity matching the bot username, or a reply whose original sender is the bot |
| Forum topic | Same addressed-message rule, scoped to its own mapping |
| Disabled mapping | Nothing; it does not return to pending admissions |

Only `update.message` with text is processed. Media, captions without text, edited-message updates and channel-post updates are not supported by this implementation. A helper can label a chat “channel”; that is not a channel-post transport implementation.

The first matching bot mention is removed from non-direct text. The remaining text must be nonempty. Merely putting an `@name` string in synthetic input without Telegram's mention entity does not satisfy that check. Replies to the bot need not contain a mention.

Messages receive a short Telegram sender/chat prefix before Core submission. This is conversational context, not verified authorization for actions described in the text.

## Sessions and agent changes

Each route uses session ID `telegram:<chatId>:<topicId-or-root>` (bounded to 128 characters). All participants in an approved group/topic share that route's session for the selected agent. Switchboard does not create a private session per participant.

In **Chat Mappings**, select an enabled agent and save to redirect subsequent messages. The route-derived session ID does not change when the agent selection changes. Do not describe this as a conversation wipe or a migration of one agent's history into another; session/history handling belongs to Core.

Uncheck **Enabled** and save to stop new messages on that route. The mapping remains visible and can be re-enabled. There is no mapping-delete API or button. Mapping updates validate the selected agent even when disabling, so choose an existing enabled agent if a formerly selected agent has been disabled or removed.

## Limits and duplicate handling

There are at most 250 stored mappings, 100 pending admissions and 200 recent delivery records (inbound and outbound together). New entries can evict older ones. These bounded settings collections are not an unlimited queue or audit ledger.

Every accepted Telegram update uses Core idempotency key `telegram-update-<update_id>`. Polling persists the next Telegram offset after processing an update. Core owns the durable idempotency contract; Switchboard also records inbound turns and outbound outcomes. This is duplicate suppression, not an unconditional exactly-once delivery guarantee. See [operations](operations.md#delivery-states-and-uncertain-outcomes).

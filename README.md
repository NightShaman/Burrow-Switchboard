# Burrow Switchboard

**Telegram in. Goblins out.**

Burrow Switchboard connects approved external chats to real Burrow agent sessions. Telegram is the first transport; Discord comes later through the same narrow adapter boundary.

## First slice

- Telegram Bot API long polling—no public webhook or reverse-proxy requirement
- Operator-owned, write-only bot token
- Unknown chats become pending admissions and cannot reach an agent
- Each approved chat/topic maps to one enabled Burrow agent
- Direct chats route every approved text message
- Group chats route only bot mentions and replies to the bot
- Durable Telegram update idempotency prevents duplicate Burrow turns
- Replies run through Core's ordinary agent pipeline with normal SOUL, context, tools, continuity, and session serialization
- Agent responses return to Telegram asynchronously
- Delivery state is durable and ambiguous outbound sends are not blindly duplicated

## Setup

1. Create a Telegram bot with BotFather and copy its token.
2. Install and enable Burrow Switchboard.
3. Open **Settings → Switchboard → Configuration**, save the write-only token, and enable polling.
4. Send the bot a message from Telegram.
5. Approve the pending chat and select the Burrow agent that should receive it.

Telegram groups must mention the bot or reply to one of its messages. If Telegram privacy mode is enabled, BotFather's privacy rules still apply.

## Development

Requires Node.js 24 and a sibling current `Burrow-Backend` checkout for the Core contract test.

```sh
npm run build
npm test
```

Switchboard is distributed under the [Burrow Sustainable Use License](LICENSE).

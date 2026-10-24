<img src="docs/assets/hero.png" width="720" alt="Burrow Switchboard" />

# Burrow Switchboard

**Telegram and Discord in. Goblins out.**

Burrow Switchboard connects approved external chats to real Burrow agent sessions. Telegram and Discord are implemented text transports; Core executes agent turns for approved routes.

## Implemented scope

- Telegram Bot API long polling and Discord Gateway WebSocket/REST use outbound connections; neither requires an inbound webhook
- Named bot connections have immutable transport (`telegram` or `discord`), scoped admissions, routing, sessions, deliveries and write-only credentials
- Unknown DMs/groups/topics (Telegram) and DMs/channels/threads (Discord) require approval for each bot; approval maps a route to one enabled Burrow agent
- Approved DMs route text; group/channel/thread turns require a human mention of or reply to the selected bot
- Approved group/topic or guild/channel context is durable, bounded and shared across approved bots; observing other messages never automatically wakes an agent
- Core executes ordinary agent turns with normal SOUL, tools, continuity and session serialization; answers return asynchronously
- Delivery records and duplicate suppression are bounded; ambiguous outbound sends are not blindly resent
- Native Discord `/help`, `/status`, `/stop`, `/new` and `/model`; command-specific Core compatibility is described in [Discord setup](docs/discord.md#native-slash-commands)
- No attachments, voice or streaming; Telegram does not implement native command handling

## Setup

1. Install and enable Switchboard with a compatible Core. Create an operator-owned [Telegram bot](docs/setup.md) or [Discord application/bot](docs/discord.md).
2. In **Settings → Switchboard → Configuration**, add a named bot connection, choose its transport, enter its write-only token and enable polling (Telegram) or gateway (Discord). Use a separate Discord application per goblin.
3. Send a text message to the bot; approve that bot's pending route in **Pending Admissions** and select an enabled Burrow agent.
4. Send a **fresh** text message to trigger an approved DM, or mention/reply to the bot in an approved group/channel/thread. Check **Status** for delivery outcomes.

Telegram group privacy rules still apply. Discord requires the Message Content intent and bot channel/thread permissions; see the [Discord setup and two-bot acceptance checklist](docs/discord.md).

## Development

Requires Node.js 24 and a sibling current `Burrow-Backend` checkout for the Core contract test.

```sh
npm run build
npm test
```

Switchboard is distributed under the [Burrow Sustainable Use License](LICENSE).

## Documentation

Start with the [Switchboard guide](docs/index.md) for operator setup, admission and routing, Settings, delivery troubleshooting, architecture, the mod-local API and development checks. These pages describe the implemented Telegram and Discord text transports and their distinct delivery boundaries.


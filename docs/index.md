# Burrow Switchboard

![Snickerdink at the Burrow Switchboard, with the purple speaker O and “Connecting chaos. Please hold.” tagline.](assets/hero.png)

**Telegram and Discord in. Goblins out.** Switchboard connects approved Telegram chats/topics and Discord DMs/channels/threads to real Burrow agent sessions. The operator chooses an agent; Core executes the turn; Switchboard returns the completed answer on the same transport.

## Current implementation

The implemented transports are **Telegram and Discord, text-only**. Telegram uses outbound long polling; Discord uses an outbound Gateway WebSocket and REST. Neither uses an inbound webhook or requires a public reverse-proxy route. Unknown routes require per-bot admission before messages reach an agent. Approved group/channel/thread routes respond only to human mentions of or replies to that bot.

| Implemented | Not implemented here |
| --- | --- |
| Operator-managed Telegram polling and Discord Gateway/REST, named bot connections | Other providers or inbound webhooks |
| Per-bot admission and per-chat/topic or DM/channel/thread agent mapping | Automatic admission, user-level allowlists, permanent deny list |
| Core external-agent-turn submission and reconciliation | A separate model runner, tool system or Tutor capability |
| Text answers split to provider limits | Attachments, slash commands, voice, streaming replies |
| Durable bounded room context and delivery records | Unlimited audit history, manual replay or retry |

An approved group/topic or guild channel/thread is a shared route: approval is **not** a separate approval of each participant. Choose an agent whose capabilities are appropriate for everyone who can address the bot there. External messages enter the real agent pipeline; approval is not a guarantee that the message is safe or authorized for every tool action.

## Read next

- [Set up Telegram](setup.md)
- [Set up Discord and check two-bot context](discord.md)
- [Admission and routing](routing.md)
- [Settings reference](settings.md)
- [Operations and troubleshooting](operations.md)
- [Architecture and Core contract](architecture.md)
- [Mod-local API](api.md)
- [Development, verification and source map](development.md)

## Documentation history

The original Telegram-only documentation baseline was source version **2026.10.22.1** (commit `b12d6cb2d9aae46542c55b4da12f605ee8009b34`), inspected **2026-10-22**. This is archival provenance, **not** the current feature list or evidence of live Discord delivery. Verify installed manifest/Core compatibility rather than inferring it from a package date.

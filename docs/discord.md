# Set up Discord

## Prerequisites and least privilege

Install and enable Switchboard, use an enabled limited-capability Burrow agent, and confirm Core exposes `context.agents.turns.submit` and `context.agents.turns.read`. Use **one Discord application/bot per goblin** (and one named Discord connection per bot); do not reuse a token across connections. In the [Discord Developer Portal](https://discord.com/developers/applications), create each application, add its bot, securely retain its bot token, and enable the **Message Content privileged intent** for each bot. Switchboard needs actual text content for admission and turns. Do not paste tokens into chats, logs or support reports.

Generate a bot invite for the intended server with **View Channels**, **Send Messages**, **Read Message History**, and **Send Messages in Threads**. Do not grant Administrator merely for Switchboard. Allow each bot to see/read and post in the specific channel and thread you intend to use. For a **private thread**, explicitly add/invite each bot as a thread member: parent-channel permissions alone do not imply thread membership. Server/channel permission overwrites still apply. Switchboard does not set Discord intents or permissions for you.

Switchboard connects outward to Discord's Gateway (WebSocket) and REST API; it does **not** register an inbound interaction/webhook URL or require an inbound reverse proxy. It handles text messages and native slash commands, not attachments, voice or streaming.

## First DM or channel

1. In **Settings → Switchboard → Configuration**, select **Add bot connection**, choose **Discord**, enter a name and this bot's write-only token, and enable the gateway. The transport cannot be changed later. Saving checks the bot identity with Discord. In **Status**, select the same connection and confirm its bot identity, gateway health and Core turns availability; revisit Status to refresh the snapshot.
2. From a human account send nonempty text to the bot in a DM or the intended guild channel. A pending admission for that **bot and DM/channel** appears; it does not run the agent. In **Pending Admissions**, select that bot, verify the channel identity, choose the intended enabled agent and approve.
3. Send a **fresh** text message: any approved DM text is a turn; in a channel, mention the bot (use Discord's real user mention) with a question or reply to that bot's message. The admission message is not replayed. Check **Status** and the channel for the answer; a healthy gateway alone does not prove delivery.

Each bot must be admitted separately for **each DM, channel and thread**. A thread has its own route and room history; it does not inherit the parent's mapping or context. Approval covers the route, not every human's individual permissions or the actions an agent may perform.

## Two-bot acceptance checklist (operator-run, not a live verification claim)

1. Create two distinct Discord applications/bots, enable Message Content for **both**, invite **both** with the permissions above, and create two enabled **Discord** connections in Switchboard. Choose a limited-capability agent for each bot.
2. In the same guild channel, send a human text message to each bot to request admission. Select each connection separately in **Pending Admissions**, verify the channel and approve it. Send fresh human mentions one at a time to verify both mappings.
3. Mention **bot A** from a human account and ask it to say a short distinctive fact. Wait until its answer is visibly posted. Then, in a **new human message**, mention **bot B** and ask it what bot A just said. Bot B can receive bounded shared channel context even though A's response is **not** an automatic turn for B. Unmentioned human messages and bot/webhook posts provide context only; they do not trigger bot-to-bot loops. Mentioning two bots simultaneously can race: wait for A before asking B.
4. Restart the mod/host, revisit Status, and from a human account ask B again about the preceding channel exchange. This checks retained bounded room context and reconnection behavior, not unlimited history or exactly-once delivery. No automatic resend occurs for an ambiguous outbound send.
5. Create a public thread in that channel; send human text inside it and approve the **thread route separately for each bot**. Invite **both** into a private thread before attempting its admissions. In each thread ask A to speak, then ask B about A's answer. Check that thread messages remain separate from parent-channel and other thread context. A DM admission and history are also isolated per bot.

If nothing appears, confirm bot identity and gateway health, the Message Content intent, channel visibility/history and thread membership, then the exact bot's pending admission/mapping. Replies/mentions in approved channels and threads must come from a human; bot/webhook messages are recorded as context only. Credentials remain write-only; clearing a token stops that connection but retains its bot binding and routes. Rotation is only for the **same bot**; use a new connection for a different bot. See [routing](routing.md), [operations](operations.md) and [API](api.md).

## Native slash commands

Switchboard registers `/help`, `/status`, `/stop`, `/new`, and `/model` with Discord
when its bot connects. Registration uses individual command upserts, not bulk
replacement: unrelated application commands are retained. Same-name chat-input
commands belong to Switchboard. Install the bot with the `applications.commands`
scope as well as `bot`; global commands may take time to propagate. If registration
fails, messaging stays available and registration is retried on reconnect.

Commands only operate in an approved, enabled channel/thread/DM mapping. `/help`
and `/status` are channel-scoped. `/stop`, `/new`, and model changes require a human
DM participant, or **Manage Server** / **Administrator** in guilds. Bots are ignored.
Replies are ephemeral and mentions are suppressed. Commands never generate LLM prompts.

- `/stop` cancels pending deliveries belonging to this mapped agent and current
  session only. An ambiguous admission is resolved with its durable idempotency key
  before cancellation; other sessions are not canceled.
- `/new` creates an owner-bound Core session and durably updates this channel's
  session binding. Prior sessions/history remain, but old replies are suppressed and
  pre-reset room history/quotes are not injected into the fresh session. Interaction
  IDs are Core creation idempotency keys.
- `/model` shows the selection; `/model selection:` offers safe inventory autocomplete
  and changes the current owner-bound session. Legacy deterministic Discord sessions
  must use `/new` first. Agent reassignment clears the old owned session binding.

**Release compatibility:** deploy Core's external agent cancellation, owner-bound
session creation/model read/model write, and safe `context.models.list()` APIs
**before deploying this Switchboard release**. Older Core retains ordinary messaging,
while unsupported commands explain the upgrade requirement. Interaction tokens are
transient REST credentials: never stored in settings, delivery records, or public state.
Initial deferrals are sent outside the serialized message queue; failed acknowledgments
perform no command side effects. Completed interaction IDs are durably deduplicated
within a bounded recent ledger (200 records); in-memory acknowledgments are bounded
at 500 IDs. A process failure after deferral can leave the ephemeral reply unfinished;
`/new` retries use Core idempotency, not a second fresh session.

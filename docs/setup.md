# Set up Telegram

## Before you start

You need an operator-controlled Telegram bot token, Switchboard installed and enabled in Burrow, and at least one enabled Burrow agent. Core must expose `context.agents.turns.submit` and `context.agents.turns.read`; Switchboard reports their availability in Settings. Its Node.js package declares **Node 24 or newer**.

Keep the token secret. Do not paste it into chat, screenshots, logs, shell commands, documentation, or a support report. Switchboard stores it through the host secret store and exposes only whether a token is configured. The UI cannot reveal it later.

## First direct-chat route

1. Create your bot through Telegram's BotFather and retain the token securely.
2. Install and enable the Switchboard mod using Burrow's normal mod workflow. Its manifest ID is `burrow-switchboard`; its Settings navigation label is **Switchboard**.
3. Open **Settings → Switchboard → Configuration**. Paste the token into the password field, enable Telegram polling, and save.
4. Open **Status**. Confirm the bot identity, healthy/active transport, and available Core agent turns. Status is a snapshot: revisit the section to refresh it.
5. Send a nonempty text message to the bot in Telegram. This creates a pending admission; it does **not** run the agent.
6. Open **Pending Admissions**, verify the chat/requester information, choose an enabled agent, and approve.
7. **Send a fresh text message.** The message that requested admission is not saved for replay. The new message should create an inbound delivery, then a reply after the Core turn completes.
8. Revisit **Status** and verify delivery state. A healthy poller alone does not prove that a particular answer was delivered.

If the pending request does not appear, first confirm that Telegram is delivering text messages to this bot and that polling is healthy. Switchboard does not configure Telegram-side permissions or privacy settings for you.

## Groups and forum topics

Add the bot to the intended chat using Telegram's own controls. Send text in the exact group/topic you intend to connect, then approve that pending entry. A topic is a separate mapping from the group's root chat and from other topics.

After approval, mention the bot using its Telegram username in a text message, or reply to a message sent by the bot. Unaddressed group conversation is ignored. A mention with no remaining text is also ignored. See [routing](routing.md) for the exact rules and shared-session implications.

## Safe first test

Use an agent with limited capabilities and a harmless prompt such as “Reply with a short greeting.” Verify the chosen agent, chat and topic before testing anything that could change files or external state. No live Telegram calls are needed for the repository's automated tests.

## Pause or remove the token

Uncheck polling and save to pause ingestion **and reply reconciliation** while retaining the token and records. To remove the stored token, use **Clear configured token** and confirm. Clearing also disables polling, but does not delete mappings or delivery state. Neither action is a documented cancellation of Core turns already submitted.

# Set up Telegram

For Discord applications, intents, permissions and two-bot/thread acceptance, see [Set up Discord](discord.md). This page covers Telegram-specific BotFather, privacy and polling.

## Before you start

You need an operator-controlled Telegram bot token, Switchboard installed and enabled in Burrow, and at least one enabled Burrow agent. Core must expose `context.agents.turns.submit` and `context.agents.turns.read`; Switchboard reports their availability in Settings. Its Node.js package declares **Node 24 or newer**.

Keep the token secret. Do not paste it into chat, screenshots, logs, shell commands, documentation, or a support report. Switchboard stores it through the host secret store and exposes only whether a token is configured. The UI cannot reveal it later.

## First direct-chat route

1. Create your bot through Telegram's BotFather and retain the token securely.
2. Install and enable the Switchboard mod using Burrow's normal mod workflow. Its manifest ID is `burrow-switchboard`; its Settings navigation label is **Switchboard**.
3. Open **Settings → Switchboard → Configuration**. Choose **Add bot connection**, select **Telegram**, enter a name and token, enable polling, and save. For an existing migrated connection, select it and save its token.
4. Open **Status** and select that bot connection. Confirm the bot identity, healthy/active transport, and available Core agent turns. Status is a snapshot: revisit the section to refresh it.
5. Send a nonempty text message to the bot in Telegram. This creates a pending admission; it does **not** run the agent.
6. Open **Pending Admissions**, select the same **Bot connection**, verify the chat/topic information, choose an enabled agent, and approve.
7. **Send a fresh text message.** The message that requested admission is not saved for replay. The new message should create an inbound delivery, then a reply after the Core turn completes.
8. Revisit **Status** and verify delivery state. A healthy poller alone does not prove that a particular answer was delivered.

If the pending request does not appear, first confirm that Telegram is delivering text messages to this bot and that polling is healthy. Switchboard does not configure Telegram-side permissions or privacy settings for you.

## Groups and forum topics

There are **two separate gates**: Telegram must deliver the message to the bot, then Switchboard must accept it for an approved route. Making a bot an administrator does not bypass Switchboard admission or its mention/reply filter.

### Start with one bot and one topic

1. In **Configuration**, add or select the intended bot connection and enable polling. Check that connection's identity and transport in **Status**.
2. Add that exact bot username to the group. If Telegram will not let you add it, the bot owner can check BotFather's `/setjoingroups`. Ensure the bot is allowed to send text in the group; send restrictions are separate from receiving updates. [Telegram bot settings](https://core.telegram.org/bots/features#edit-settings), [chat permissions](https://core.telegram.org/bots/api#chatpermissions).
3. Choose Telegram's delivery settings below. For Switchboard's ordinary `@BotUsername question` interaction, a non-admin bot with privacy disabled is an alternative to an admin bot. Neither setting makes all received messages agent prompts.
4. In the **exact group/topic**, send `/start@YourBotUsername` using the actual bot username. The suffix is attached to the command, with **no space**. It targets that bot rather than relying on a bare `/start` in a multi-bot group. [Telegram command delivery](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get).
5. Select the same bot connection in **Pending Admissions**, verify the group/topic, choose the intended enabled agent, and approve. A delivered command can create this pending entry, but Switchboard does not implement `/start` as an activation, configuration or approval command.
6. **Send a fresh message**, for example `@YourBotUsername Please reply with a short greeting.` Select the real username mention in Telegram. The admission message is not replayed. After a reply exists, replying directly to that bot's message is another supported trigger.
7. Check the selected connection's deliveries. Repeat admission separately for each additional bot and each topic/root route. Telegram usernames identify bot accounts; the chosen Burrow agent is selected in Switchboard, not by a Telegram command.

A topic's mapping is separate from the group root and other topics. Approval covers the chat/topic, not just the requester: participants who address the bot share its mapped agent session. Start with a limited-capability agent and a harmless question.

### Privacy mode and administrator rights

Privacy mode is normally on. It delivers targeted commands and relevant replies, not unrestricted group conversation. A plain username mention is not listed as a guaranteed ordinary-bot privacy-mode trigger. Telegram admins receive broader updates; ordinary members can instead have privacy disabled. **Admin is not universally required.** [Telegram delivery rules](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get).

To change privacy, the bot owner opens **@BotFather**, sends `/setprivacy`, selects the bot and chooses **Disable**. Remove and re-add the bot to the existing group for the change to apply. This exposes more group messages to the bot; use it only with the group's agreement. Alternatively, an authorized group administrator may promote the bot, granting only appropriate rights. Do not grant deletion, banning or other moderation powers merely to troubleshoot chat delivery. [Telegram privacy mode](https://core.telegram.org/bots/features#privacy-mode).

These are Telegram-side choices for the operator, not settings Switchboard changes automatically. A healthy poller does not prove Telegram delivered a particular group message. Privacy-on targeted commands may create admission successfully while the later ordinary mention still never arrives.

### Does everyone need to start each bot privately?

Starting a private conversation with each bot is useful for a direct-message test, but is **not a general prerequisite for group membership**: Telegram allows a user to add a bot to a group or initiate a private conversation. Private Start does not approve the group, select its agent, change privacy or grant admin rights. Private chats have separate Switchboard admissions. [Telegram bot introduction](https://core.telegram.org/bots#how-are-bots-different-from-users).

### Commands, mentions and replies are not interchangeable

Switchboard currently recognizes a Telegram `mention` entity matching the bot's username, or a reply whose original sender is that bot. Telegram represents `/start@YourBotUsername` as a `bot_command`, not that separate mention. After approval, the command alone therefore does **not** execute the mapped agent. There is no special `/start` handler. A mention with no question left after stripping it is ignored. See [routing](routing.md).

When several privacy-enabled bots are present, Telegram can deliver a given message to only one of them; replies take priority over a command addressed to another bot. Test one target at a time, and do not reply to bot A while trying to address bot B. [Telegram multi-bot delivery](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get).

### Messages from other bots

Switchboard bridges its own confirmed bot replies into shared group/topic context, without waking a peer agent. Test connectivity using a human account. This release does not change Telegram's bot-to-bot delivery behavior.

Telegram group instructions were checked **2026-10-23** against Telegram's official documentation and Switchboard `e87cc8aa261e7b74ebb7fbc01e484059dcb3f900` (**2026.10.23.2**). That historical check does not establish live Discord behavior.

## Safe first test

Use an agent with limited capabilities and a harmless prompt such as “Reply with a short greeting.” Verify the chosen agent, chat and topic before testing anything that could change files or external state. For repository test prerequisites and network-safety qualifications, see [development](development.md).

## Pause or remove the token

Uncheck polling and save to pause ingestion **and reply reconciliation** while retaining the token and records. To remove the stored token, use **Clear configured token** and confirm. Clearing also disables polling, but does not delete mappings or delivery state. Neither action is a documented cancellation of Core turns already submitted.

## Add more bots

Repeat **Configuration → Add bot connection** for each BotFather bot. Each has its own credential, poll cursor, admissions, mappings, delivery records and Core sessions. Select the intended bot before approving its pending chat. The same Telegram chat/topic can route independently through different bots with distinct Core sessions and idempotency keys, while approved group/topic connections share bounded room context. Removing or pausing one connection does not stop the others.

# Settings reference

Switchboard registers four Settings sections under its manifest ID `burrow-switchboard`.

| Section | Purpose |
| --- | --- |
| **Status** (`status`) | Primary page: transport, bot identity, Core capability, mappings, pending admissions and recent deliveries |
| **Configuration** (`configuration`) | Add, select, rename, pause or remove named bot connections |
| **Pending Admissions** (`pending-admissions`) | Choose an enabled agent and approve a request, or deny it |
| **Chat Mappings** (`chat-mappings`) | Change the selected agent or enable/disable an existing route |

## Configuration

Every section has a **Bot connection** selector displaying the provider. Discord creation shows an intent/permissions reminder; the configured connection shows its immutable transport. See [Discord setup](discord.md). Selection persists across sections; diagnostics, approvals, mappings and deliveries always belong to that selected bot.

- **Add bot connection:** choose **Telegram** or **Discord**, enter a name (up to 80 characters), token and enable toggle. Save validates the token with the selected provider before creating the connection. The transport is immutable; a bot can belong to only one connection on that provider.
- **Connection name:** rename without changing routing or history.
- **Enable Telegram polling / Discord gateway:** enables only this bot. Disabling pauses ingestion and reply reconciliation; other bots continue independently.
- **Bot token:** write-only password input. Blank preserves the saved secret. A supplied token must be nonempty, at most 4,096 characters. Rotating a token is allowed only for the same provider bot; add a new connection for a different bot.
- **Clear configured token:** confirmation-protected; removes only this connection's credential and disables it. Its bot binding, Telegram offset (where applicable), mappings and deliveries remain.
- **Remove connection:** confirmation-protected; stops this worker and permanently deletes its credential, admissions, mappings and delivery state. It does not delete Core conversations or cancel submitted Core turns.

Existing installations appear as the **Telegram** connection (`default`), preserving the credential, routes, offset, history and Core session identity without copying secrets.

Polling/gateway timeouts, retry intervals, provider endpoints, delivery limits and message chunk size are implementation constants/defaults, not operator settings.

## Status interpretation

Transport displays health and polling or gateway state and the last completed poll/gateway activity. Bot identity is populated after successful provider identity validation (`getMe` or Discord `/users/@me`). Core availability checks for the external-turn methods; it does not prove a dispatcher is wired or a configured agent will successfully answer.

Recent deliveries show direction and status. The API contains additional delivery metadata/errors, but the UI does not render every per-delivery error. The transport error appears as an alert, and missing Core turn support produces a warning.

The UI loads on mount and after mutations; it has **no periodic auto-refresh**. Revisit the section/page for a newer snapshot. A load failure offers Retry. Leaving the section aborts its pending request and disposes its mounted UI.

## Access control

The mod API rejects unauthenticated requests when the host reports authentication enabled. When host authentication is disabled, the mod does not independently require a login. Protect the Burrow operator interface using the host's access controls; write-only tokens do not make an exposed settings endpoint safe.

# Settings reference

Switchboard registers four Settings sections under its manifest ID `burrow-switchboard`.

| Section | Purpose |
| --- | --- |
| **Status** (`status`) | Primary page: transport, bot identity, Core capability, mappings, pending admissions and recent deliveries |
| **Configuration** (`configuration`) | Enable/disable polling, replace or clear the bot token |
| **Pending Admissions** (`pending-admissions`) | Choose an enabled agent and approve a request, or deny it |
| **Chat Mappings** (`chat-mappings`) | Change the selected agent or enable/disable an existing route |

## Configuration

- **Enable Telegram polling:** defaults to off. Enabling without a token produces `telegram_token_missing` and a stopped/degraded transport.
- **Telegram bot token:** password input. Leaving it blank when saving preserves the current token. Entering a new value replaces it; the API rejects an empty supplied token. The token is never returned in public state.
- **Save configuration:** persists the checkbox and any nonblank replacement token.
- **Clear configured token:** confirmation-protected action; clears the secret and disables polling.

Replacing or clearing the token resets cached bot identity, **not** the saved offset, mappings or deliveries. Do not treat token replacement with a different bot as a clean installation. There is no reset-state control in this UI.

Polling timeouts, retry intervals, Telegram endpoint, delivery limits and message chunk size are implementation constants/defaults, not operator settings.

## Status interpretation

Transport displays health, polling state and the most recent completed poll time. Bot identity is populated after successful `getMe`. Core availability checks for the external-turn methods; it does not prove a dispatcher is wired or a configured agent will successfully answer.

Recent deliveries show direction and status. The API contains additional delivery metadata/errors, but the UI does not render every per-delivery error. The transport error appears as an alert, and missing Core turn support produces a warning.

The UI loads on mount and after mutations; it has **no periodic auto-refresh**. Revisit the section/page for a newer snapshot. A load failure offers Retry. Leaving the section aborts its pending request and disposes its mounted UI.

## Access control

The mod API rejects unauthenticated requests when the host reports authentication enabled. When host authentication is disabled, the mod does not independently require a login. Protect the Burrow operator interface using the host's access controls; write-only tokens do not make an exposed settings endpoint safe.

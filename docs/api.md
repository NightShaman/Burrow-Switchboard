# Mod-local API

These are **mod-local paths**, registered on `context.api`, not claims about a universal host URL prefix. The Settings UI uses the host-provided mod API client. Preserve the host's authentication and routing when integrating another client.

## Connection routes

All mutations return the full aggregate public state. Use connection IDs from `connections`, not names. Token creation/update calls Telegram `getMe` to validate identity before changing persisted configuration.

| Method and path | Body | Effect |
| --- | --- | --- |
| `POST /connections` | `{ "name": "Alerts", "token": "<token>", "enabled": true }` | Create a named connection with independent state |
| `PUT /connections/:connectionId` | `{ "name": "Alerts", "enabled": false, "token": "<optional-same-bot-token>" }` | Rename/configure this connection; name/token optional, enabled required |
| `POST /connections/:connectionId/token/clear` | None | Clear this credential, disable polling, preserve binding/state |
| `DELETE /connections/:connectionId` | None | Stop and delete this connection's credential/state, not Core conversations |
| `POST /connections/:connectionId/pending/:id/approve` | `{ "agentId": "<agent>" }` | Approve this bot's pending route |
| `POST /connections/:connectionId/pending/:id/deny` | None | Deny this bot's current request |
| `PUT /connections/:connectionId/mappings/:id` | `{ "agentId": "<agent>", "enabled": true }` | Update this bot's mapping |

Names must be nonblank strings up to 80 characters. Unknown properties are rejected. Errors include 400 `connection_invalid`, `connection_name_invalid`, `telegram_token_validation_failed`, `telegram_auth_failed`, `telegram_rate_limited`, `telegram_response_invalid`; 404 `connection_not_found`; 409 `telegram_bot_already_connected`, `telegram_bot_changed_add_connection`. The latter means add the different bot as another connection rather than carrying old routes onto it.

## Legacy routes (default connection)


| Method and path | Body | Effect |
| --- | --- | --- |
| `GET /bootstrap` | None | Full public state |
| `GET /configuration` | None | Same full public state, not just configuration |
| `PUT /configuration` | `{ "enabled": true, "token": "<replacement-token>" }` | Save enabled flag and optionally replace token |
| `POST /configuration/token/clear` | None required | Remove token, disable polling, clear cached bot identity |
| `POST /pending/:id/approve` | `{ "agentId": "<enabled-agent-id>" }` | Approve exact pending route |
| `POST /pending/:id/deny` | None required | Remove current pending entry |
| `PUT /mappings/:id` | `{ "agentId": "<enabled-agent-id>", "enabled": false }` | Update existing mapping |

Use IDs returned in public state; do not derive them from a displayed chat title. There is no delete-mapping, retry-delivery, reset-state or provider-selection endpoint.

Configuration requires a boolean `enabled`; omit `token` to preserve the secret. A supplied token must be a nonempty string, at most 4,096 characters, and is trimmed. Approval/mapping agent IDs must be nonempty strings at most 96 characters. Configuration, approval and mapping bodies reject unknown keys, arrays and non-object values. Mapping updates require both fields and validate the agent even if disabling.

## Success and state

Every successful route returns HTTP 200 with `{ "ok": true, ...state }` and `Cache-Control: no-store`. State includes `connections: [{id, name, ...connectionState}]` and shared `coreAgentTurns`. For backward compatibility top-level fields below describe only `default` (empty/stopped if removed). Per-connection state includes:

- `enabled` and `tokenConfigured` booleans.
- `bot`: configured indicator and, when known, `id`, `username`, `displayName`.
- `transport`: enabled, health, polling, lastPollAt, error.
- `coreAgentTurns`: available and, when unavailable, reason.
- `mappings`: saved route fields plus resolved `agentName`.
- `pending`: chat/topic/requester admission records.
- `deliveries`: recent records plus resolved `agentName`.

The token and internal Telegram offset are not returned. Treat requester details and delivery metadata as operator data, not public telemetry.

## Errors

Errors return `{ "ok": false, "error": "<code>" }` with no-store headers. Known 4xx errors preserve their status/code; other failures become HTTP 500 `switchboard_request_failed`.

| Status | Codes / conditions |
| --- | --- |
| 400 | `configuration_invalid`, `telegram_token_invalid`, `approval_invalid`, `mapping_invalid` |
| 401 | `operator_authentication_required` when host authentication is enabled but request is unauthenticated |
| 404 | `agent_not_found`, `pending_admission_not_found`, `mapping_not_found` |
| 409 | `agent_disabled` |
| 500 | Sanitized `switchboard_request_failed` |

Validation order can affect which error is returned; for example approval validates the selected agent before looking up the pending ID. Do not depend on an error as a route-existence probe.

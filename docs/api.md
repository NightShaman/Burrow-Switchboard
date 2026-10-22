# Mod-local API

These are **mod-local paths**, registered on `context.api`, not claims about a universal host URL prefix. The Settings UI uses the host-provided mod API client. Preserve the host's authentication and routing when integrating another client.

## Routes

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

Every successful route returns HTTP 200 with `{ "ok": true, ...state }` and `Cache-Control: no-store`. State includes:

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

# API

Mousehole provides a API for programmatic access to its functionality.

## Authentication

Protected endpoints accept a Bearer token. Set the `MOUSEHOLE_AUTH_TOKEN`
environment variable and pass it in the `Authorization` header:

```
Authorization: Bearer <token>
```

Example with curl:

```sh
curl -H "Authorization: Bearer mytoken" http://localhost:5010/state
```

## `/state`

### `GET /state`

Protected: Yes

Retrieve the current state of the MAM service.

Example response bodies:

- ```json
  {
    "host": { "ip": "123.123.123.123", "asn": 12345, "as": "MegaCorp" },
    "nextCheckAt": "2025-06-21T14:27:28.113-05:00[America/Chicago]",
    "hasCurrentCookie": true,
    "lastMam": {
      "request": {
        "at": "2025-06-21T13:26:50.536-05:00[America/Chicago]"
      },
      "response": {
        "httpStatus": 200,
        "body": {
          "Success": true,
          "msg": "No change",
          "ip": "123.123.123.123",
          "ASN": 12345,
          "AS": "MegaCorp"
        }
      }
    },
    "lastUpdate": {
      "hostIp": "123.123.123.123",
      "mamUpdated": false,
      "at": "2025-06-21T14:22:28.111-05:00[America/Chicago]"
    }
  }
  ```

### `PUT /state`

Protected: Yes

Reset state for a new provided cookie value.

If a cookie is applied successfully, this endpoint also deletes the state
related to the last MAM response and last update. This is because the cookie is
tied to those states.

Example request bodies:

- ```json
  {
    "currentCookie": "<new-cookie>"
  }
  ```

Responses are identical to the `GET /state` response, reflecting the updated
state.

## `/update`

### `POST /update`

Protected: Yes

Manually trigger an update of MAM if needed (or if forced).

Example request bodies:

- ```jsonc
  {
    "force": true, // Optional, defaults to false
  }
  ```
- ```json
  {}
  ```

Example response bodies:

- ```json
  {
    "host": { "ip": "123.123.123.123", "asn": 12345, "as": "MegaCorp" },
    "mamUpdated": true,
    "mamUpdateReason": "forced",
    "at": "2025-06-21T14:45:16.576-05:00[America/Chicago]"
  }
  ```

- ```json
  {
    "host": { "ip": "123.123.123.123", "asn": 12345, "as": "MegaCorp" },
    "mamUpdated": true,
    "mamUpdateReason": "last-response-error",
    "at": "2025-06-21T14:45:16.576-05:00[America/Chicago]"
  }
  ```

- ```json
  {
    "host": { "ip": "123.123.123.123", "asn": 12345, "as": "MegaCorp" },
    "mamUpdated": true,
    "mamUpdateReason": "last-response-error",
    "at": "2025-06-21T14:45:16.576-05:00[America/Chicago]"
  }
  ```

## `/ok`

### `GET /ok`

Protected: No

**This endpoint will soon be deprecated in favor of `/health`.**

A convenience endpoint to check if MAM needs to be updated with the host IP
address.

Example response bodies:

- ```json
  {
    "ok": true,
    "reason": "no-update-needed"
  }
  ```

- ```json
  {
    "ok": false,
    "reason": "no-last-response"
  }
  ```

If `ok` is true, then the status code is 200. If `ok` is false, then the status
code is 503.

## `/health`

### `GET /health`

Protected: No

Health check endpoint. Returns 200 when no MAM update is needed, 503 otherwise.

The response always includes an `isOnline` field indicating whether the server
was able to reach MAM. When `isOnline` is `false`, the network interface is
likely down and `neededUpdateReason` is not included (because network
connectivity is needed to ascertain that). When `isOnline` is `true`, the server
reached MAM and `ok` reflects whether an update is needed.

Possible `neededUpdateReason` values (only present when `isOnline` is `true` and
`ok` is `false`): `no-last-response`, `last-response-error`, `ip-changed`,
`asn-changed`, `cookie-changed`, `response-stale`.

If `ok` is true, then the status code is 200. If `ok` is false, then the status
code is 503.

Example response bodies:

- ```json
  {
    "ok": true,
    "isOnline": true
  }
  ```

- ```json
  {
    "ok": false,
    "isOnline": true,
    "neededUpdateReason": "ip-changed"
  }
  ```

- ```json
  {
    "ok": false,
    "isOnline": false
  }
  ```

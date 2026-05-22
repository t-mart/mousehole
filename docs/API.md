# API

Some guiding principles:

- HTTP status code indicates success/failure.
- Endpoint paths use `kebab-case`.
- Object properties use `camelCase`.
- Object string values (various types/actions/error-codes) use `kebab-case`,
  unless they are from an external APIs.
- Failures from external APIs return a 500
- Datetime strings are RFC 9557 format (this is what Temporal produces on
  `toString()`)

## `/state`

### `GET /state`

Retrieve the current state of the MAM service.

Example response bodies:

- ```json
  {
    "host": { "ip": "123.123.123.123", "asn": 12345, "as": "MegaCorp" },
    "nextUpdateAt": "2025-06-21T14:27:28.113-05:00[America/Chicago]",
    "currentCookie": "<some-cookie>",
    "lastMam": {
      "request": {
        "cookie": "<some-cookie>",
        "at": "2025-06-21T13:26:50.536-05:00[America/Chicago]"
      },
      "response": {
        "cookie": "<some-cookie>",
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

Manually trigger an update of MAM if needed (or if forced).

Example request bodies:

- _(no body)_
- ```jsonc
  {
    "force": true // Optional, defaults to false
  }
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

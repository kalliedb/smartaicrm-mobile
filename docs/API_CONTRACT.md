# API contract

The mobile app calls the same `api.smartaicrm.co.za/api/v1` backend the
web portal uses. This document lists the endpoints the mobile app
consumes (or will consume by sprint).

## Auth

| Endpoint | Sprint | Notes |
|---|---|---|
| `POST /auth/login` | M-0 | `{ identifier, password }` → `{ accessToken, refreshToken, user }` |
| `POST /auth/refresh` | M-0 | Refresh-on-401 in axios interceptor |
| `POST /auth/logout` | M-0 | Best-effort; clears tokens locally regardless |
| `POST /auth/devices/register` | M-1 | Per-device session id (TBD: add to backend) |

## Identity

| Endpoint | Sprint | Notes |
|---|---|---|
| `GET /me` | M-1 | Hydrate session user object on app launch |
| `GET /me/modules` | M-2 | Plan + enabled modules; gates which screens show |

## CRM

| Endpoint | Sprint | Notes |
|---|---|---|
| `GET /companies` `POST /companies` | M-2 | Quick-create company |
| `GET /contacts` `POST /contacts` | M-2 | Quick-create contact |
| `GET /leads` `POST /leads` | M-2 | Quick-create lead |
| `GET /catalogue/items` | M-2 | Catalogue cache for quote line items |

## Quotes / Invoices / Payments

| Endpoint | Sprint | Notes |
|---|---|---|
| `POST /sales/quotes` | M-2 | Create quote |
| `POST /sales/quotes/:id/convert-to-invoice` | M-2 | One-tap convert (TBD: backend may not have this exact endpoint yet) |
| `POST /finance/ar/invoices` | M-2 | Create invoice |
| `POST /billing/payments` | M-5 | Record a payment (Yoco webhook hits server separately to mark paid) |

## AI gateway (voice)

| Endpoint | Sprint | Notes |
|---|---|---|
| `POST /ai/transcribe` | M-6 | Audio → text (cloud Whisper fallback) |
| `POST /ai/extract` | M-6 | Text → structured intent + fields |

## Push

| Endpoint | Sprint | Notes |
|---|---|---|
| `POST /me/push-token` | M-9 | Register APNS / FCM token |

---

### Conventions

All endpoints return the standard envelope:

```json
{ "success": true, "data": {…} }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "…" } }
```

JWT is sent as `Authorization: Bearer <token>`. Refresh on 401 is
handled in `src/api/client.ts` — call sites don't need to deal with it.

### TODO

- Catalogue offline-cache delta endpoint (`GET /catalogue/items?since=…`) — confirm
  the existing endpoint supports `since` or add it in sprint M-6.
- Quote→invoice convert endpoint — confirm path with backend team.
- Per-device session revocation — confirm `users.devices` shape or add it.

# Tomorrow Ready: school payments

An isolated PayPal hackathon variant of Tomorrow Ready. A fictional school message becomes a source-linked payment draft; a person checks the details, approves an order in PayPal Sandbox, and keeps a verified receipt even if the event is cancelled.

## Run locally

Use Node 26 and the repository's existing dependencies (`npm ci` for a fresh checkout).

```sh
npm run paypal:dev
```

Open http://127.0.0.1:4322/payments.html. The host and port are intentional: the local API checks Host, Origin and a per-process CSRF token. This is a single-user local prototype, not a deployable public payment service.

Connect an **existing Sandbox** application and its Business account's merchant ID in the setup form. The server checks OAuth credentials and saves `.env.paypal` with owner-only file permissions. Credentials never go to the client status endpoint or client bundle. `.env.paypal` and `.payment-data/` are excluded from Git. Do not publish or copy them into a demo package.

For optional live AI extraction, use `.env.paypal.example` as the field reference. `PAYPAL_AI_KEY` is an existing Fireworks key; `PAYPAL_AI_CALL_LIMIT` defaults to zero. Explicitly authorized calls are counted durably before dispatch, including failed calls. A restart does not renew the budget. The November 4 owner authorization is **4 calls in this local workspace**; 2 were used: the accepted example and a recorded repeat for the video. Do not reset or delete the ledger to renew that authorization.

## Verified journey

1. Load the fictional museum message and explicitly send it for AI extraction, or copy the example manually using the clearly labelled fallback.
2. Review EUR 12.50, the exact quote, the November 12 deadline and the fixed Sandbox merchant. Saving is a separate human decision.
3. Open PayPal Sandbox and sign in with the Developer dashboard's existing **Personal sandbox account**. Use test credentials and test funds only.
4. Approve the order. Back in Tomorrow Ready, explicitly finish the test payment. The server reads the order, verifies the exact reference/amount/currency/merchant, captures only an approved order, and requires a completed capture before showing Paid.
5. Paste the fictional cancellation, quote it and confirm the event. The receipt remains; the UI indicates that a refund needs attention. No refund API is called.

The successful November 4 Sandbox payment used order `5EF856840C016223B`, capture `7AS438527D0103231`, EUR 12.50. These are test records, not revenue. The live extraction used Fireworks `accounts/fireworks/models/muse-spark-open`, two requests with fictional data. One example does not establish general model accuracy.

## Failure handling and limits

- Create/capture requests use stable idempotency keys and a durable local ledger. In-process mutations are serialized.
- A timeout or restart during a dispatched payment request becomes Unknown. The app does not automatically resend. Check PayPal status; if the create response had no order ID, inspect the Sandbox dashboard using the displayed request ID. Do not create a replacement obligation to bypass this guard.
- A changed message with the same event name cannot create another payment record. This conservative prototype does not implement corrected-amount payments or an event identity system across renamed events.
- AI cannot pick the payee or pay. Missing/ambiguous extraction is rejected; exact quotes and dates are checked server-side and require human review. The current parser requires an explicit ISO date and EUR, USD or PLN.
- Cancellation is a local event state, not a PayPal refund or void. A cancelled record with an uncertain transaction still needs provider reconciliation.
- The single-process JSON ledger is suitable for this local demonstration only. Multi-user deployment would require authentication, database transactions, validated webhooks, secret management, operational recovery and separate approval.

## Checks and contest delivery

```sh
npm run paypal:test
npm run paypal:build
```

15 affected tests cover evidence validation, CSRF/origin restrictions, duplicate actions, provider approval, exact capture matching, uncertain outcomes, restart recovery and cancellation retention. Desktop and 320 px UI were inspected. Browser reload retained the draft and paid/cancelled record. The submitted Meta version and production DuetNest are separate and unchanged.

The application runs locally. This branch supplies the open-source PayPal variant, with a separate YouTube demonstration and Devpost entry. The earlier Meta hosted demo is not a substitute for this working PayPal route. The official deadline checked November 4 is November 12, 2026, 12:00 PST (20:00 UTC / 21:00 Warsaw / 22:00 Kyiv).

Official references: [competition rules](https://paypalaihackathon.devpost.com/rules), [create order](https://developer.paypal.com/api/orders/v2/orders-create), [capture order](https://developer.paypal.com/api/orders/v2/orders-capture), [get order](https://developer.paypal.com/api/orders/v2/orders-get).

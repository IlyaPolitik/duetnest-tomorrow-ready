# Tomorrow Ready: School Payments

**PayPal AI Hackathon 2026 · Illia Borovikov · 160418 OÜ**

Turn a school message into a payment you can verify, approve and find again. AI extracts an explicit amount, currency and deadline with source quotations. A parent reviews the draft and the fixed test recipient, approves the order in PayPal Sandbox, and keeps a verified receipt when plans change.

This branch contains the functioning **PayPal variant**. The earlier Meta submission remains on [`main`](https://github.com/IlyaPolitik/duetnest-tomorrow-ready/tree/main); its hosted recorded walkthrough is a different entry and is not the PayPal demo.

## Run the working application

Requires Node.js 26, npm, internet, a free PayPal Developer/Sandbox account and an existing Fireworks API key for live AI. Fireworks account/credit requirements are set by that provider; no provider credentials are included in this public repository. No production PayPal account upgrade or real payment is needed.

```sh
git clone --branch codex/paypal-hackathon-20261104 --single-branch https://github.com/IlyaPolitik/duetnest-tomorrow-ready.git
cd duetnest-tomorrow-ready
npm ci --ignore-scripts
npm run paypal:dev
```

Open **http://127.0.0.1:4322/payments.html**. This route includes its local server API; serving `dist-paypal` as static files alone does not provide payments or AI.

### PayPal setup

1. Sign in to [PayPal Developer](https://developer.paypal.com/dashboard/applications/sandbox) and select **Sandbox**. Use an existing/default Sandbox application.
2. Under Sandbox Accounts, open the app's **Business** account and read its Account ID (merchant ID). The default **Personal** account is the test buyer.
3. In the app, open **Set up Sandbox** and enter the Sandbox client ID, secret and merchant ID. The local server verifies them and writes `.env.paypal` with owner-only permissions.
4. Never enter Live credentials. Keep the Business account as recipient and use the separate Personal sandbox login at checkout.

### Live AI setup

Stop the local server after PayPal setup. Add your existing [Fireworks](https://fireworks.ai/) key and your chosen small test limit to `.env.paypal`, then restart `npm run paypal:dev`:

```dotenv
PAYPAL_AI_KEY=your_existing_fireworks_key
PAYPAL_AI_CALL_LIMIT=4
```

The model is `accounts/fireworks/models/muse-spark-open`. Use a key authorized to call it. The limit is a durable **total call count** for this workspace, not a recurring allowance; failed requests also count. Existing workspaces must retain their ledger and previously authorized limit. Secrets stay on the server; requests go only to PayPal Sandbox and Fireworks. Never commit `.env.paypal` or `.payment-data`.

Without an AI key, the app explicitly shows AI as unavailable and allows manual entry. Manual sample copying is a labelled fallback, not an AI result. Live AI extraction was separately verified for the recorded demonstration.

## Five-step walkthrough

1. Choose **Try a fictional school message**. Explicitly consent to sending it to Fireworks and click **Find payment details with AI**.
2. Review EUR 12.50, the November 12 deadline, exact source quotations and the Sandbox recipient. Check the review box and save.
3. Open PayPal Sandbox from the payment card. Sign in with the existing Personal **sandbox** account and approve the test order.
4. Back in the app, click **I approved in PayPal · finish test payment**. Only a verified `COMPLETED` capture with matching amount, currency, merchant and reference becomes Paid.
5. Review the fictional cancellation, quote it and confirm. Reload: the receipt remains, and the event shows **Refund needs attention**. Cancellation does not automatically return money.

An unknown network outcome blocks blind create/capture retries. **Check PayPal status** reads the existing order. If creation was dispatched but no order ID returned, inspect the Sandbox dashboard using the request ID shown by the app; do not work around the guard by renaming the event.

## What was built for this entry

On November 4, 2026, this separate variant added payment-specific AI extraction and evidence validation, mandatory human review, fixed Sandbox payee binding, OAuth/Orders v2 create/approval/capture/readback, durable transaction state and idempotency keys, cancellation with receipt retention, a responsive English interface, and 15 targeted tests. The prior school-planning idea existed before this variant; we do not claim the entire repository was first created for PayPal.

One real Sandbox order/capture was completed for EUR 12.50 using fictional data, then independently read back from PayPal. It is test evidence, not revenue. The demonstration also shows recorded interaction with the functioning app; cuts do not represent a latency benchmark.

## Checks

```sh
npm run paypal:test
npm run paypal:build
```

15 targeted tests cover evidence validation, request-origin/CSRF checks, duplicate actions, provider approval, exact receipt matching, uncertain outcomes, restart recovery and cancellation retention. The interface was inspected on desktop and at 320 px. See [implementation notes](payments/README.md) for details.

## Boundaries and license

This is a single-user, local hackathon prototype with a single-process JSON ledger. It has no public payment backend, school onboarding, automatic refunds, webhook delivery, real customer validation or measured time-saving claim. The payment parser currently requires an explicit ISO date and EUR, USD or PLN. Quotes support human review; they do not prove a message's meaning or legitimacy.

Original code: [MIT](LICENSE), © 2026 160418 OÜ. Dependencies retain their own licenses; see [third-party notices](THIRD-PARTY-NOTICES.md). Production DuetNest, credentials and private account data are outside this repository.

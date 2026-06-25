# Satsend

**On-chain Bitcoin payment requests, powered by Stacks and sBTC.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Built on Stacks](https://img.shields.io/badge/Built%20on-Stacks-5546FF)](https://stacks.co)
[![Clarity](https://img.shields.io/badge/Contract-Clarity-orange)](https://docs.stacks.co/clarity)

Satsend is an on-chain Bitcoin payment protocol built on Stacks that lets anyone create, send, and settle sBTC invoices — no custodian, no intermediary, no email required. A creator specifies an amount, a deadline, and a memo. Satsend generates a unique invoice stored permanently on-chain. The creator shares a link. The payer connects their Stacks wallet and pays. sBTC moves directly from payer to creator. The invoice is settled on-chain, verifiable on Stacks Explorer forever.

---

## The Problem

Bitcoin is the hardest money ever created. But requesting a Bitcoin payment in 2025 still means copying a raw address into a message and hoping the other person sends the right amount to the right place before you need to follow up.

There is no native invoicing or payment-request primitive on Stacks today. Freelancers, merchants, and DAOs who want to get paid in Bitcoin have no structured way to do it on-chain. They share wallet addresses with:

- No defined amount
- No deadline or expiry
- No memo or description
- No confirmation that payment was received
- No audit trail either party can point to

This is not a UX problem. It is a missing protocol primitive. The Bitcoin ecosystem has Lightning invoices. Ethereum has payment channel tooling. Stacks — the only L2 that settles directly on Bitcoin — has nothing equivalent for sBTC.

Satsend builds that primitive.

---

## What Satsend Will Be

The current release is the foundation: a Clarity smart contract that handles the core create → pay → settle lifecycle. But Satsend is designed to grow into a full payment infrastructure layer for the Stacks ecosystem.

### Today — Invoice Protocol (v1)

The contract deployed today gives every Stacks user the ability to:

- **Create** a structured payment request with an amount (in sBTC), a deadline (Stacks block height), and a memo stored on-chain
- **Share** it as a link (`satsend.app/pay/{invoice-id}`) that any wallet holder can open
- **Pay** directly — sBTC transfers on-chain from payer to creator in a single transaction
- **Settle** permanently — the invoice status is written to chain, visible on Stacks Explorer, and cannot be altered

### Near-Term — Protocol Expansions (v2)

- **Partial payments** — allow a payer to pay a fraction of an invoice, useful for milestone-based work or split bills
- **Recurring invoices** — a subscription primitive that lets creators define a payment schedule and lets payers authorize recurring sBTC debits
- **Multi-recipient invoices** — split an invoice payment across multiple principals at settlement time, enabling shared revenue, royalty splits, and DAO treasury contributions
- **Invoice templates** — reusable invoice configurations for recurring business relationships

### Medium-Term — Developer Ecosystem (v3)

- **Satsend SDK** — a TypeScript library that lets any Stacks dApp embed invoice creation and payment in a few lines of code
- **Webhook / Chainhook integration** — real-time settlement notifications to external systems when an invoice is paid, enabling off-chain workflows (order fulfillment, content unlock, API access)
- **Payment links with metadata** — richer invoice objects that can carry structured data like order IDs, product descriptions, or references to off-chain records stored on Gaia or Arweave
- **Public invoice registry** — an opt-in on-chain index that lets platforms query all open invoices by creator or tag, enabling marketplace and discovery features

### Long-Term — Bitcoin Payment Infrastructure

Satsend's endgame is to be the default payment layer for value exchange on Stacks — the same role that payment processors play in web2, but non-custodial, permissionless, and settled on Bitcoin.

- **Merchant integrations** — plugins for commerce platforms that accept sBTC at checkout via Satsend invoices
- **DAO treasury tooling** — structured payment requests for contributors, grant recipients, and service providers, with on-chain audit trails for governance
- **Cross-chain settlement hooks** — as Bitcoin's L2 ecosystem matures, Satsend invoices that trigger multi-chain settlement flows
- **DeFi integrations** — invoice-collateralized lending (borrow against outstanding receivables), invoice factoring, and yield on idle sBTC held in escrow

---

## How It Works

```
 Creator                         Satsend Contract                    Payer
    │                                    │                              │
    ├── connect Stacks wallet ──────────►│                              │
    ├── create-invoice(                  │                              │
    │     amount,                        │                              │
    │     deadline,          ───────────►│                              │
    │     memo               )           │                              │
    │◄─────────────────── invoice-id ────┤                              │
    │                                    │                              │
    ├── share: satsend.app/pay/{id} ─────┼─────────────────────────────►│
    │                                    │                              │
    │                                    │◄── connect Stacks wallet ────┤
    │                                    │◄── get-invoice(id) ──────────┤
    │                                    ├─── invoice details ─────────►│
    │                                    │                              │
    │                                    │◄── pay-invoice(id) ──────────┤
    │                                    │    (sBTC transfer on-chain)  │
    │◄─────────────────── sBTC ──────────┤                              │
    │                                    │                              │
    │             invoice status: "settled" written to chain            │
    │             verifiable on Stacks Explorer, permanently            │
```

### Invoice Lifecycle

```
                     ┌─────────────────────────────┐
                     │                             │
  create-invoice ──► │          PENDING            │
                     │                             │
                     └──────────────┬──────────────┘
                                    │
              ┌─────────────────────┼──────────────────────┐
              │                     │                      │
              ▼                     ▼                      ▼
        ┌──────────┐         ┌──────────┐          ┌──────────────┐
        │ SETTLED  │         │CANCELLED │          │   EXPIRED    │
        │          │         │          │          │              │
        │ pay-     │         │ cancel-  │          │ block-height │
        │ invoice  │         │ invoice  │          │ > deadline   │
        └──────────┘         └──────────┘          └──────────────┘
```

Once an invoice leaves the `pending` state, it is final. Settled, cancelled, and expired invoices cannot be modified.

---

## Architecture

Satsend is intentionally minimal at the contract layer. The protocol does one thing: manage the lifecycle of a payment request. No upgradeability, no admin keys, no treasury. Every invoice is between the creator and the payer — the contract is just the enforcer.

```
┌─────────────────────────────────────────────┐
│              Stacks Blockchain               │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │          satsend.clar                │   │
│  │                                      │   │
│  │  invoices map                        │   │
│  │  ┌────────────────────────────────┐  │   │
│  │  │ invoice-id → {                 │  │   │
│  │  │   creator  : principal         │  │   │
│  │  │   amount   : uint (satoshis)   │  │   │
│  │  │   deadline : uint (block)      │  │   │
│  │  │   memo     : string-ascii-256  │  │   │
│  │  │   status   : string-ascii-16   │  │   │
│  │  │   payer    : optional principal│  │   │
│  │  │ }                              │  │   │
│  │  └────────────────────────────────┘  │   │
│  │                                      │   │
│  │  invoice-counter : uint              │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │     sBTC SIP-010 Token Contract      │   │
│  │  (Hiro/Bitcoin Layers deployment)    │   │
│  └──────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
           │                    │
           ▼                    ▼
    ┌─────────────┐      ┌────────────┐
    │  Frontend   │      │  Stacks    │
    │  React +    │      │  Explorer  │
    │  Stacks.js  │      │  (verify)  │
    └─────────────┘      └────────────┘
```

**Key design decisions:**

- **No hardcoded sBTC address** — `pay-invoice` accepts the sBTC contract as a SIP-010 trait parameter. The same contract works on testnet and mainnet without redeployment; the caller passes the appropriate contract principal.
- **Stateless reads** — `get-invoice` never mutates state. The contract does not automatically mark invoices as expired on-chain. Callers compare the stored `deadline` block height against the current chain tip themselves. This keeps reads cheap and prevents lazy expiry attacks.
- **String statuses** — invoice status is stored as a human-readable string (`"pending"`, `"settled"`, `"cancelled"`) rather than an enum integer. This makes off-chain indexing and Explorer inspection self-documenting without a secondary lookup table.
- **Immutable invoice data** — once created, the `creator`, `amount`, `deadline`, and `memo` fields can never be modified. Only `status` and `payer` change, and only under strict guards. There is no edit or update function.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Clarity 2 (Stacks) |
| Contract testing | Clarinet + Vitest + `@hirosystems/clarinet-sdk` |
| Frontend (coming) | React 18 + TypeScript + Vite |
| Wallet support | Leather, Xverse via `@stacks/connect` |
| Asset | sBTC (SIP-010 token, 1:1 Bitcoin-backed) |
| Network | Stacks testnet → mainnet |
| Settlement | Bitcoin (every Stacks block anchors to Bitcoin) |

---

## Contract Function Reference

All functions live in [`contracts/satsend.clar`](./contracts/satsend.clar).

### `create-invoice`

```clarity
(create-invoice (amount uint) (deadline uint) (memo (string-ascii 256)))
  → (response uint uint)
```

Creates a new invoice on-chain. Returns the invoice ID.

| Parameter | Type | Description |
|---|---|---|
| `amount` | `uint` | sBTC amount in satoshis. 1 BTC = 100,000,000 satoshis. |
| `deadline` | `uint` | Stacks block height after which the invoice expires. Must be strictly greater than the current block height. |
| `memo` | `string-ascii 256` | Free-text description visible to the payer. Max 256 ASCII characters. |

**Errors:** `ERR-INVALID-AMOUNT (u100)` if amount is 0. `ERR-INVALID-DEADLINE (u101)` if deadline is not in the future.

---

### `pay-invoice`

```clarity
(pay-invoice (invoice-id uint) (sbtc-contract <sip-010-trait>))
  → (response bool uint)
```

Pays an invoice. Transfers sBTC from `tx-sender` directly to the invoice creator. Marks the invoice as `"settled"` and records the payer's principal.

**Errors:**

| Code | Meaning |
|---|---|
| `u102` ERR-NOT-FOUND | Invoice ID does not exist |
| `u103` ERR-ALREADY-SETTLED | Invoice was already paid |
| `u104` ERR-CANCELLED | Invoice was cancelled by the creator |
| `u105` ERR-EXPIRED | Current block height has passed the deadline |
| `u106` ERR-SELF-PAYMENT | Creator cannot pay their own invoice |
| `u107` ERR-TRANSFER-FAILED | sBTC transfer returned an error |

---

### `cancel-invoice`

```clarity
(cancel-invoice (invoice-id uint))
  → (response bool uint)
```

Cancels a pending invoice. Only callable by the invoice creator. Cannot cancel a settled invoice.

**Errors:** `u102` not found, `u108` ERR-NOT-CREATOR, `u103` already settled, `u104` already cancelled.

---

### `get-invoice` *(read-only)*

```clarity
(get-invoice (invoice-id uint))
  → (optional {
      creator:  principal,
      amount:   uint,
      deadline: uint,
      memo:     (string-ascii 256),
      status:   (string-ascii 16),
      payer:    (optional principal)
    })
```

Returns full invoice details, or `none` if the ID has never been created.

---

### `get-invoice-count` *(read-only)*

```clarity
(get-invoice-count) → uint
```

Returns the total number of invoices ever created. Because IDs are sequential starting at 1, this also equals the highest valid invoice ID.

---

## Error Code Reference

| Code | Constant | Trigger |
|---|---|---|
| `u100` | `ERR-INVALID-AMOUNT` | `create-invoice` called with `amount = 0` |
| `u101` | `ERR-INVALID-DEADLINE` | `deadline ≤ current block-height` |
| `u102` | `ERR-NOT-FOUND` | Invoice ID does not exist in the map |
| `u103` | `ERR-ALREADY-SETTLED` | Attempt to pay or cancel a settled invoice |
| `u104` | `ERR-CANCELLED` | Attempt to pay a cancelled invoice |
| `u105` | `ERR-EXPIRED` | Attempt to pay after the deadline block has passed |
| `u106` | `ERR-SELF-PAYMENT` | Creator and `tx-sender` are the same principal |
| `u107` | `ERR-TRANSFER-FAILED` | The SIP-010 `transfer` call returned an error |
| `u108` | `ERR-NOT-CREATOR` | `cancel-invoice` called by someone other than the creator |

---

## Local Development

### Prerequisites

- [Clarinet](https://github.com/hirosystems/clarinet) — Stacks smart contract toolchain
- [Node.js](https://nodejs.org/) v18+
- [Leather](https://leather.io/) or [Xverse](https://www.xverse.app/) browser wallet (for frontend, coming soon)

### Install Clarinet

```bash
# macOS / Linux
brew install clarinet

# Windows — use the installer from the Clarinet releases page:
# https://github.com/hirosystems/clarinet/releases
```

### Clone and run tests

```bash
git clone https://github.com/DevVichy/Satsend.git
cd Satsend

# Install JS test dependencies
npm install

# Run the full test suite
npm test
```

All 18 unit tests should pass. If you see errors, make sure your Node version is 18+ and Clarinet is installed.

### Explore in the Clarinet REPL

```bash
clarinet console
```

Inside the REPL, you can call functions manually against a local simulated chain:

```clarity
;; Create an invoice (amount in satoshis, deadline as block height, memo)
(contract-call? .satsend create-invoice u1000000 u1000 "Design work — June 2025")

;; Read it back
(contract-call? .satsend get-invoice u1)

;; Check how many invoices exist
(contract-call? .satsend get-invoice-count)
```

---

## Deploy to Stacks Testnet

### 1. Fund a testnet account

Get testnet STX from the [Stacks Faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet). You need STX to pay transaction fees.

### 2. Add your deployer mnemonic

Create `settings/Testnet.toml` (it is gitignored — never commit your mnemonic):

```toml
[network]
name = "testnet"

[accounts.deployer]
mnemonic = "your twelve word mnemonic phrase here"
```

### 3. Deploy

```bash
clarinet deployments apply --testnet
```

### 4. Verify on Stacks Explorer

```
https://explorer.hiro.so/txid/<your-tx-id>?chain=testnet
```

Your contract will be live at `<deployer-address>.satsend`.

---

## Roadmap

### Phase 1 — Testnet (now)
- [x] Core Clarity contract: `create-invoice`, `pay-invoice`, `cancel-invoice`, `get-invoice`
- [x] Full unit test suite (18 tests, happy path + all error states)
- [ ] Frontend: React + Stacks.js wallet connection, create and pay invoice UI
- [ ] Testnet deployment and public demo

### Phase 2 — Mainnet
- [ ] Security audit of the Clarity contract
- [ ] Mainnet deployment alongside production sBTC contract
- [ ] Production frontend at `satsend.app`
- [ ] Stacks Explorer integration / custom invoice viewer

### Phase 3 — Ecosystem Integrations
- [ ] Partial payment support
- [ ] Recurring invoice primitive (subscription protocol)
- [ ] Multi-recipient invoice splitting
- [ ] Satsend SDK (`npm install @satsend/sdk`)
- [ ] Chainhook-powered settlement webhooks
- [ ] DAO treasury tooling: contributor payments with on-chain audit trail
- [ ] Merchant plugins (WooCommerce, Shopify via headless API)

---

## Contributing

Satsend is open source and welcomes contributions at every level.

### Getting started

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature-name`
3. Write or update tests in `tests/satsend.test.ts` first
4. Implement your changes
5. Run `npm test` — all tests must pass before opening a PR
6. Open a pull request with a clear description of what changed and why

### Code conventions

- **Clarity contract** — one blank line between top-level definitions. Every public function must have a comment block explaining its invariants, not just what it does. All error paths must be tested.
- **TypeScript** — strict mode, no `any`, named exports only. Test files mirror source structure.
- **Commits** — use conventional commit format: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`

### Good first issues

- Add an `is-expired` read-only function that returns a boolean for a given invoice ID
- Add a `get-invoices-by-creator` index (note: Clarity maps are not iterable — this requires a secondary data structure)
- Improve test coverage for edge cases at exact deadline block heights

---

## License

MIT — see [LICENSE](./LICENSE).

---

*Built with Clarity, sBTC, and the conviction that Bitcoin payments should be programmable, verifiable, and open.*

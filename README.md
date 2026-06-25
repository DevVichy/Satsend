# Satsend

**On-chain sBTC invoice protocol built on Stacks.**

Satsend lets anyone create a Bitcoin payment request on-chain, share it as a link, and receive sBTC with Bitcoin-level settlement finality — no custodian, no intermediary, no email required.

---

## The Problem

There is no native invoicing primitive on Stacks today. Freelancers, merchants, and DAOs who want to get paid in sBTC must share raw wallet addresses with no amount, no deadline, no memo, and no on-chain confirmation that payment was received. Satsend fixes this.

---

## How It Works

```
Creator                          Protocol                         Payer
  │                                 │                               │
  ├─ connect wallet ────────────────►│                               │
  ├─ create-invoice(amount,         │                               │
  │    deadline, memo) ────────────►│                               │
  │◄──────────────── invoice-id ────┤                               │
  │                                 │                               │
  ├─ share link: satsend.app/pay/{id}──────────────────────────────►│
  │                                 │                               │
  │                                 │◄──── connect wallet ──────────┤
  │                                 │◄──── get-invoice(id) ─────────┤
  │                                 ├──── invoice details ─────────►│
  │                                 │                               │
  │                                 │◄──── pay-invoice(id) ─────────┤
  │                                 │   (sBTC transfer on-chain)    │
  │◄──────────────── sBTC ──────────┤                               │
  │                                 │                               │
  │             invoice marked "settled" on-chain                   │
```

### Invoice States

```
[pending] ──── pay-invoice ────► [settled]
    │
    ├── cancel-invoice (by creator) ──► [cancelled]
    │
    └── block-height > deadline ──────► [expired]
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Clarity (Stacks) |
| Contract Testing | Clarinet + Vitest |
| Frontend | React 18 + TypeScript + Vite |
| Wallet | Stacks.js, Leather, Xverse |
| Asset | sBTC (SIP-010 token) |
| Network | Stacks testnet → mainnet |

---

## Project Structure

```
satsend/
├── contracts/
│   └── satsend.clar          # Core invoice protocol contract
├── tests/
│   └── satsend.test.ts       # Full Clarinet unit tests
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConnectWallet.tsx
│   │   │   ├── CreateInvoice.tsx
│   │   │   └── PayInvoice.tsx
│   │   ├── hooks/
│   │   │   └── useInvoice.ts
│   │   ├── lib/
│   │   │   └── stacks.ts     # Contract call helpers
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── Clarinet.toml
├── settings/
│   ├── Devnet.toml
│   └── Testnet.toml
└── README.md
```

---

## Local Development

### Prerequisites

- [Clarinet](https://github.com/hirosystems/clarinet) — Stacks smart contract dev tool
- [Node.js](https://nodejs.org/) v18+
- [Leather](https://leather.io/) or [Xverse](https://www.xverse.app/) browser wallet

### 1. Install Clarinet

```bash
# macOS
brew install clarinet

# or via curl
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install clarinet
```

### 2. Clone and set up

```bash
git clone https://github.com/your-handle/satsend.git
cd satsend
```

### 3. Run contract tests

```bash
clarinet test
```

### 4. Launch Clarinet console (REPL)

```bash
clarinet console
```

Inside the console you can call functions manually:

```clarity
(contract-call? .satsend create-invoice u1000000 u1000 "Invoice #1 - Design work")
(contract-call? .satsend get-invoice u1)
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Deploy to Stacks Testnet

### 1. Configure your deployer account

Add your testnet private key to `settings/Testnet.toml`:

```toml
[network]
name = "testnet"

[accounts.deployer]
mnemonic = "YOUR MNEMONIC HERE"
```

Get testnet STX from the [Stacks faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet).

### 2. Deploy

```bash
clarinet deployments apply --testnet
```

### 3. Verify on explorer

Visit `https://explorer.hiro.so/txid/<tx-id>?chain=testnet` to confirm deployment.

### 4. Update frontend config

In `frontend/src/lib/stacks.ts`, set:

```ts
export const CONTRACT_ADDRESS = "YOUR_DEPLOYER_ADDRESS";
export const NETWORK = new StacksTestnet();
```

---

## Contract Function Reference

All functions live in `contracts/satsend.clar`.

### `create-invoice`

```clarity
(create-invoice (amount uint) (deadline uint) (memo (string-ascii 256)))
  → (response uint uint)
```

Creates a new invoice. `deadline` is a Stacks block height. Returns the new `invoice-id`.

| Param | Type | Description |
|---|---|---|
| `amount` | `uint` | sBTC amount in satoshis (1 BTC = 100,000,000) |
| `deadline` | `uint` | Block height after which invoice expires |
| `memo` | `string-ascii 256` | Payment description or reference |

**Errors:** `ERR-INVALID-AMOUNT (u100)`, `ERR-INVALID-DEADLINE (u101)`

---

### `pay-invoice`

```clarity
(pay-invoice (invoice-id uint))
  → (response bool uint)
```

Pays an existing invoice. Transfers sBTC from `tx-sender` to the invoice creator. Marks invoice as `"settled"`.

**Errors:** `ERR-NOT-FOUND (u102)`, `ERR-ALREADY-SETTLED (u103)`, `ERR-CANCELLED (u104)`, `ERR-EXPIRED (u105)`, `ERR-SELF-PAYMENT (u106)`, `ERR-TRANSFER-FAILED (u107)`

---

### `cancel-invoice`

```clarity
(cancel-invoice (invoice-id uint))
  → (response bool uint)
```

Cancels an invoice. Only callable by the invoice creator. Invoice must be in `"pending"` state.

**Errors:** `ERR-NOT-FOUND (u102)`, `ERR-NOT-CREATOR (u108)`, `ERR-ALREADY-SETTLED (u103)`, `ERR-CANCELLED (u104)`

---

### `get-invoice` (read-only)

```clarity
(get-invoice (invoice-id uint))
  → (optional { creator: principal, amount: uint, deadline: uint,
                memo: (string-ascii 256), status: (string-ascii 16),
                payer: (optional principal) })
```

Returns full invoice details, or `none` if the ID doesn't exist.

---

### `get-invoice-count` (read-only)

```clarity
(get-invoice-count) → uint
```

Returns the total number of invoices ever created.

---

## Error Codes

| Code | Constant | Meaning |
|---|---|---|
| u100 | ERR-INVALID-AMOUNT | Amount must be > 0 |
| u101 | ERR-INVALID-DEADLINE | Deadline must be in the future |
| u102 | ERR-NOT-FOUND | Invoice ID does not exist |
| u103 | ERR-ALREADY-SETTLED | Invoice already paid |
| u104 | ERR-CANCELLED | Invoice was cancelled |
| u105 | ERR-EXPIRED | Deadline has passed |
| u106 | ERR-SELF-PAYMENT | Creator cannot pay their own invoice |
| u107 | ERR-TRANSFER-FAILED | sBTC transfer failed |
| u108 | ERR-NOT-CREATOR | Only the creator can cancel |

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Write or update tests in `tests/satsend.test.ts`
4. Run `clarinet test` — all tests must pass
5. Open a PR with a clear description of what changed and why

### Code style

- Clarity contract: one blank line between top-level definitions, comments on every public function explaining its invariants
- TypeScript: strict mode, no `any`, named exports only
- Commits: conventional commits (`feat:`, `fix:`, `test:`, `docs:`)

---

## Roadmap

- [ ] Partial payments (pay-partial-invoice)
- [ ] Recurring invoices (subscription primitive)
- [ ] Invoice templates
- [ ] Email/push notification on settlement via Chainhook
- [ ] Mainnet deployment

---

## License

MIT — see [LICENSE](LICENSE).

---

Built with Clarity, sBTC, and a conviction that Bitcoin payments should be programmable.

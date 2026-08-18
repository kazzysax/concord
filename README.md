# Concord

Negotiate, sign, and settle deals without either side getting cheated.
Two parties meet in a room, talk terms, draft a contract from that
conversation, both consent, e-sign, and the deed's hash goes on-chain —
then milestone invoices settle to deterministic addresses that work on
every EVM chain.

## Run it

```
# Backend
cd backend && npm install
node server.js                 # :4000

# Frontend (second terminal)
cd frontend && npm install && npm run dev    # :5173

# Indexer (third terminal, once contracts are deployed)
cd backend && node indexer.js
```

### Images
Two photos need dropping in, or the hero/login panels fall back to flat teal:
- `frontend/public/hero.jpg` — landing hero
- `frontend/public/signing.jpg` — login left panel

Free sources: search Unsplash or Pexels for "signing contract pen".

### Environment
```
FACTORY_ADDRESS=0x...            # after deploying, must match on all chains
SWEEPER_INIT_CODE_HASH=0x...     # from InvoiceFactory.SWEEPER_INIT_CODE_HASH()
REGISTRAR_PRIVATE_KEY=0x...      # burner, only registers commitments
BASE_SEPOLIA_RPC_URL=...
ARBITRUM_SEPOLIA_RPC_URL=...
ANTHROPIC_API_KEY=...            # for drafting terms from chat
```
Anything unset degrades gracefully — chain.js logs instead of writing,
/draft returns 503 — so the app runs before contracts are live.

## Contracts

```
cd contracts && forge test -vvv                  # run BEFORE deploying
source .env
forge script script/Deploy.s.sol --rpc-url base_sepolia     --broadcast --verify
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify
```
**Then diff the two printed factory addresses.** They must match. Everything
downstream depends on it.

## Flow

1. **Landing** → problem, solution, five-stage workflow
2. **Login** — wallet or Google (Privy creates a wallet either way)
3. **Dashboard** — your deals; start one, get an invite link
4. **Conference room** — chat freely, then "draft terms from this chat"
5. **Terms thread** — versioned offers and counters, accept a version
6. **Consent gate** — BOTH parties tick "no further changes". Nothing reaches
   the chain without this.
7. **Freeze** — deed hashed, registered on-chain, milestone addresses derived
8. **Deed document** — cream paper, wallet signatures, commitment hash
9. **Track page** — milestone status from the chain only; click one to open
   its invoice as a document
10. **Subcontracts** — addenda to a frozen deed, same double-consent rule

The invite link (`/c/{concordId}?token=...`) stays valid the whole time and
resolves to whichever stage the deal is currently at.

## Files

**Contracts** (`contracts/`) — `src/InvoiceFactory.sol`, `src/Sweeper.sol`,
`test/InvoiceFactory.t.sol`, `script/Deploy.s.sol`, `foundry.toml`, `.env.example`

**Backend** (`backend/`) — `server.js` (invoices, indexer callback), `concord.js`
(deals, consent, subcontracts, freeze), `chat.js`, `draft.js` (LLM drafting),
`chain.js` (only file holding a key), `auth.js`, `indexer.js`, `package.json`

**Frontend** (`frontend/`) — `Landing`, `Login`, `App` (dashboard), `ConcordLink`
(link resolver), `ConferenceRoom`, `DeedDocument`, `InvoiceDocument`, `TrackPage`,
`theme.js`, `ui.js`, `AuthContext.jsx`, `api.js`

**Schemas** (`schemas/`) — `deal-schema.json`, `frozen-contract-example.json`,
`invoice-schema.json` — reference shapes, not consumed by code directly

## Known stubs

- `AuthContext.jsx` fakes Privy — swap for `@privy-io/react-auth`. Backend
  `auth.js` `verifyStub` is the matching half; replace both together.
- Signatures are stubbed strings, not real wallet signs. Backend verification
  (`verifyMessage`) is real and will reject bad ones once wired.
- Viewing keys use fixed passphrases, not real key exchange.
- CCTP cross-chain settlement and stealth addresses are architecture, not code.

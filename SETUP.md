# Concord — full setup, in order

Follow this top to bottom. Each stage depends on the one before it.

## 0. Open in VS Code

Unzip `concord.zip`, open the resulting folder as your workspace. You'll see
`contracts/`, `backend/`, `frontend/`, `schemas/`, plus this file and
`README.md` at the root.

You'll need 3-5 terminal tabs open at once by the end (`` Ctrl+` `` to open
the panel, `+` to add tabs).

---

## 1. Prerequisites

```bash
node --version      # need 18+
```
Install Foundry:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

---

## 2. Contracts — test, then deploy

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit
forge test -vvv
```
**Do not proceed if any test fails.** `test_addressIsIdenticalAcrossChains`
is the one the whole app depends on.

```bash
cp .env.example .env
```
Fill in `.env`: a fresh burner `DEPLOYER_PRIVATE_KEY` (funded with testnet
ETH — faucet links are in the file), RPC URLs, and leave `SALT` at its
default.

```bash
source .env
forge script script/Deploy.s.sol --rpc-url base_sepolia     --broadcast --verify
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify
```
**Compare the two printed `Deployed InvoiceFactory at:` addresses.** They
must match exactly, or stop and fix your config before continuing.

Get the init code hash:
```bash
cast keccak "$(forge inspect Sweeper bytecode)"
```
Write down `FACTORY_ADDRESS` and `SWEEPER_INIT_CODE_HASH` — you'll need both
in the next step.

---

## 3. Choose your persistence mode

Concord's backend has two storage drivers behind the same interface
(`backend/store.js`):

- **`STORE_DRIVER=memory`** (default) — zero setup, but **every deal is
  lost on restart.** Fine for a first look at the code, not fine for
  anything you'd call a demo, let alone real usage.
- **`STORE_DRIVER=postgres`** — real persistence. Needs a `DATABASE_URL`.
  This is what "going live" actually requires.

For local Postgres without installing it yourself, `docker-compose.yml` at
the repo root spins one up — see step 7. For now, either:

**Option A — quick local Postgres via Docker:**
```bash
docker run -d --name concord-db -e POSTGRES_DB=concord -e POSTGRES_USER=concord \
  -e POSTGRES_PASSWORD=devpassword -p 5432:5432 postgres:16-alpine
```
Then `DATABASE_URL=postgres://concord:devpassword@localhost:5432/concord`

**Option B — a hosted free tier** (Supabase, Neon, Railway all have one) —
copy the connection string they give you.

**Option C — skip this for now**, run with `STORE_DRIVER=memory`, come back
once you're ready to stop losing data on restart.

---

## 4. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:
```
STORE_DRIVER=postgres                 # or "memory" per step 3
DATABASE_URL=postgres://...           # only if postgres

FACTORY_ADDRESS=0x...                 # from step 2
SWEEPER_INIT_CODE_HASH=0x...          # from step 2
REGISTRAR_PRIVATE_KEY=0x...           # a SEPARATE burner from your deployer key
BASE_SEPOLIA_RPC_URL=...
ARBITRUM_SEPOLIA_RPC_URL=...

PRIVY_APP_ID=...                      # from dashboard.privy.io - omit for dev-auth mode
PRIVY_APP_SECRET=...
INDEXER_SECRET=some-long-random-string  # shared secret between backend and indexer

ANTHROPIC_API_KEY=...                 # optional - enables draft-from-chat
PORT=4000
```

**If you omit `PRIVY_APP_ID`/`PRIVY_APP_SECRET`:** the server logs a loud
warning and runs in dev-auth mode — tokens aren't cryptographically
verified, anyone could forge one. It will **refuse to start** if you also
set `NODE_ENV=production` alongside missing Privy credentials, specifically
so this can't ship by accident.

Run tests before running the server:
```bash
npm test
```
All 15 should pass — this covers the consent gate specifically (freeze
correctly refuses with zero or one-sided consent, and a new proposal
correctly clears stale consent from a prior version).

```bash
node server.js
```
Check `http://localhost:4000/health` — should return
`{"ok":true,"store":"...","devAuth":...}`.

---

## 5. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:
```
VITE_PRIVY_APP_ID=...     # same App ID as backend's PRIVY_APP_ID. Omit for dev-auth mode.
```

**This one matters at build time, not just runtime** — Vite inlines
`import.meta.env` values into the compiled bundle, so if you're building a
Docker image (step 7) this has to be set as a build arg, not just a runtime
env var.

Drop in the two images (optional — falls back to flat teal without them):
- `frontend/public/hero.jpg`
- `frontend/public/signing.jpg`

```bash
npm run dev
```
Open `http://localhost:5173`.

---

## 6. Indexer

```bash
cd backend
node indexer.js
```
Needs the same `FACTORY_ADDRESS`, RPC URLs, `STORE_DRIVER`/`DATABASE_URL`,
and `INDEXER_SECRET` as the backend — reads them from the same
`backend/.env`.

This polls both chains, checkpoints its progress (per-chain, in the store),
and is safe to kill and restart — it resumes from the last block it
finished, not from genesis, and the backend rejects duplicate events by
`(txHash, logIndex, chain)` so a replayed range can't double-count a
payment.

---

## 7. Docker (optional — for staging/production, not required for local dev)

```bash
cp .env.example .env    # at repo root — same variables as backend/.env plus DB_PASSWORD
docker compose up --build
```
Brings up Postgres, the backend API, the indexer, and the frontend behind
nginx, all wired together. Backend on `:4000`, frontend on `:8080`.

For real production: run the backend and indexer as **separate services**
(they scale differently — one API instance behind a load balancer, exactly
one indexer instance since it's not built for concurrent runners), and
point `DATABASE_URL` at a managed Postgres rather than the compose file's
`db` container.

---

## 8. Confirm the whole thing actually works

1. `http://localhost:5173` → landing page
2. "Start a deal" → sign in
3. Create a deal → copy the invite link
4. Open it in a second browser/incognito window → sign in as someone else →
   land in the conference room
5. Chat, "draft terms from this chat" (needs `ANTHROPIC_API_KEY`)
6. Propose/accept from both windows, both tick consent
7. "Sign and record on-chain" — pauses for a few seconds (real block
   confirmations); check the backend terminal or a block explorer for your
   `FACTORY_ADDRESS`
8. Deed document renders with the commitment hash
9. Track page, click a milestone to see its invoice
10. **Restart the backend.** If you're on `STORE_DRIVER=postgres`, the deal
    is still there when it comes back. If you're still on `memory`, it's
    gone — that's your signal to go set up Postgres before calling this done.

---

## What's now real vs. what's still a deliberate stub

**Now real, verified by actually running it:**
- Persistence — Postgres driver behind the same interface as memory, tested with `npm test`
- Auth — real Privy server-side token verification, refuses to boot insecurely in production
- Indexer — checkpointed, chunked, idempotent, survives restarts
- Rate limiting and input validation on every route
- E-signing — real wallet signatures (`ethers.Wallet` in dev mode, real embedded/connected wallet via Privy in production), verified server-side with `ethers.verifyMessage`
- Backend test suite — 15 tests, all passing, covering the consent gate specifically

**Still a deliberate stub, flagged in code at the swap point:**
- Viewing-key encryption uses fixed passphrases derived from party names — mechanism is real, key exchange underneath it isn't
- Contracts are testnet-only and unaudited — do not deploy to mainnet without a third-party audit first
- CCTP cross-chain settlement and stealth addresses were discussed as architecture but never implemented — `Sweeper.sweep()` only moves funds same-chain
- No terms of service / privacy policy / legal review of what "deed of agreement" means in your actual jurisdiction

The gap between this and true production is now much smaller: mainly the
audit, and writing real ECIES key wrapping for viewing keys.

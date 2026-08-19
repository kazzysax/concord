# Concord

Concord is a contract workflow app for negotiating, freezing, and tracking milestone-based agreements with on-chain settlement on Polygon.

Two parties can:

- open a deal room
- negotiate terms
- accept and consent to a final version
- freeze the agreement on-chain
- track milestone invoices tied to deterministic settlement addresses

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Auth: Privy
- Contracts: Solidity + Foundry
- Chain: Polygon mainnet
- Settlement token: USDC on Polygon

## Repository layout

- `frontend/` — web app
- `backend/` — API server and indexer worker
- `contracts/` — smart contracts, tests, and deploy script
- `schemas/` — reference JSON schemas

## Local development

Backend:

```bash
cd backend
npm install
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Indexer:

```bash
cd backend
npm run indexer
```

Default local ports:

- frontend: `5173`
- backend: `4000`

## Environment

Copy the root example file and fill the values you need:

```bash
cp .env.example .env
```

Important production variables:

- `PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `DATA_ENCRYPTION_KEY`
- `POLYGON_RPC_URL`
- `FACTORY_ADDRESS`
- `SWEEPER_INIT_CODE_HASH`
- `REGISTRAR_PRIVATE_KEY`
- `PAYMENT_ASSETS_JSON`

The current production settlement asset is Polygon USDC:

- token: `USDC`
- address: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`

## Contracts

Contract source lives in `contracts/src`.

Useful commands:

```bash
cd contracts
forge build
forge test
```

Polygon deployment uses:

- `contracts/script/Deploy.s.sol`
- `contracts/foundry.toml`
- `contracts/.env.example`

## Main user flow

1. Create a concord
2. Invite the counterparty
3. Negotiate and version terms
4. Accept and consent
5. Freeze the agreement
6. Generate milestone invoices
7. Track payment status
8. Sweep settled funds to the configured sink

## Current state

Implemented:

- concord creation and invite links
- versioned term acceptance and consent flow
- freeze flow
- milestone invoice tracking
- Polygon mainnet factory deployment support
- backend tests for core regressions

Still worth reviewing before broad production use:

- auth wiring should be verified end-to-end in your live Privy project
- operational secrets should be rotated if they were ever shared insecurely
- contract and treasury operations should be reviewed before handling material value

## Deployment

The repo is prepared for hosted deployment, but production requires:

- a Postgres-backed backend
- Privy credentials
- Polygon RPC access
- deployed contract values

If you are deploying manually, make sure backend and indexer receive the same:

- `FACTORY_ADDRESS`
- `POLYGON_RPC_URL`

And the backend additionally receives:

- `SWEEPER_INIT_CODE_HASH`
- `REGISTRAR_PRIVATE_KEY`
- `DATA_ENCRYPTION_KEY`

## Notes

- `backend/chain.js` and the contracts deploy script are the sensitive on-chain integration points.
- `backend/indexer.js` watches the deployed factory and updates application state from chain activity.
- `frontend/src/api.js` supports a configurable API base URL through `VITE_API_BASE_URL`.

# Render Deployment Notes

This repo is prepared for Render with:

- `concord-frontend` as a static site
- `concord-backend` as a Node web service
- `concord-indexer` as a Node background worker
- `concord-db` as Render Postgres

Primary config file:

- [render.yaml](C:/Users/HP/Downloads/concord/render.yaml)

GitHub source:

- https://github.com/kazzysax/concord

## Polygon / USDC

Production settlement is configured for Polygon PoS mainnet USDC:

- Chain: `polygon`
- Chain ID: `137`
- Token: `USDC`
- Token address: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`

## Blueprint validation status

`render blueprints validate render.yaml` is clean except for Render account billing/payment requirements.

Current remaining Render-side blocker:

- `need_payment_info`

## Values you must supply in Render

Required application secrets and config:

- `PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `DATA_ENCRYPTION_KEY`
- `POLYGON_RPC_URL`

Required only after Polygon contract deployment:

- `FACTORY_ADDRESS`
- `SWEEPER_INIT_CODE_HASH`
- `REGISTRAR_PRIVATE_KEY`

## Deployment order

1. Enable payment info in Render.
2. Create services from `render.yaml`.
3. Fill non-contract env vars:
   - `PRIVY_APP_ID`
   - `PRIVY_APP_SECRET`
   - `DATA_ENCRYPTION_KEY`
   - `POLYGON_RPC_URL`
4. Deploy Polygon contracts.
5. Fill contract env vars:
   - `FACTORY_ADDRESS`
   - `SWEEPER_INIT_CODE_HASH`
   - `REGISTRAR_PRIVATE_KEY`
6. Redeploy `concord-backend`.
7. Confirm `concord-indexer` is running.
8. Verify frontend login, contract creation, invite flow, and invoice tracking.

## Contract deployment gate

Do not set these until Polygon contracts are actually deployed:

- `FACTORY_ADDRESS`
- `SWEEPER_INIT_CODE_HASH`
- `REGISTRAR_PRIVATE_KEY`

When you want to cross that gate, I will give you the exact Polygon mainnet deploy sequence.

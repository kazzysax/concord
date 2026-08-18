# Render Deployment Notes

This repo is prepared for Render with:

- `concord-frontend` as a static site
- `concord-backend` as a Node web service
- `concord-indexer` as a Node background worker
- `concord-db` as Render Postgres

The Blueprint file is [render.yaml](C:/Users/HP/Downloads/concord/render.yaml).

## Polygon / USDC

Production settlement is configured for Polygon PoS mainnet USDC:

- Chain: `polygon`
- Chain ID: `137`
- Token: `USDC`
- Token address: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`

## Values you still need to supply in Render

Render will prompt or require these values:

- `PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `DATA_ENCRYPTION_KEY`
- `POLYGON_RPC_URL`
- `FACTORY_ADDRESS`
- `SWEEPER_INIT_CODE_HASH`
- `REGISTRAR_PRIVATE_KEY`

## Important

Do not fill in:

- `FACTORY_ADDRESS`
- `SWEEPER_INIT_CODE_HASH`
- `REGISTRAR_PRIVATE_KEY`

until the Polygon contracts are actually deployed.

That is the contract deployment gate. When you want to cross it, tell me and I’ll give you the exact deploy sequence.

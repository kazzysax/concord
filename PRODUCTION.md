# Concord Production Checklist

This codebase is materially closer to launch, but it is not production-ready until the items below are completed.

## Code-level changes already in place

- Persistent invite claims are stored with the concord record instead of an in-memory map.
- Mutual acceptance and mutual consent are enforced on the latest terms version only.
- Production e-signatures are required before freeze.
- Freeze claiming is atomic, so duplicate freeze requests cannot both win.
- Milestone invoices are written into durable storage and can now be updated by the indexer.
- Payment accounting uses configured token decimals instead of assuming 6 decimals.
- Invoice document access is tied to authenticated recipient IDs instead of caller-supplied shared secrets.
- CORS, readiness checks, graceful shutdown, and production config validation are now enforced.
- Frontend nginx now proxies `/api` to the backend service.
- The factory no longer depends on a post-deploy `initialize` call.

## Still required before going live

- Complete an external smart-contract audit.
- Keep deployment on testnets until that audit is done.
- Provision real Privy credentials.
- Provision managed Postgres and run with `STORE_DRIVER=postgres`.
- Generate and store a real `DATA_ENCRYPTION_KEY`.
- Set `CORS_ORIGINS` explicitly for the real frontend domain.
- Set `PAYMENT_ASSETS_JSON` to the exact token contracts and decimals for each supported chain.
- Set `REGISTRAR_PRIVATE_KEY`, `FACTORY_ADDRESS`, `SWEEPER_INIT_CODE_HASH`, and RPC URLs for every configured chain.
- Run exactly one indexer instance in production.
- Add legal review, privacy policy, and terms of service for the jurisdictions you plan to serve.

## Important business constraint

There is no FX conversion layer in the product. In production, the negotiated contract currency must match the configured settlement token symbol exactly, for example `USDC`.

## Verified locally

- Backend tests: `21` passing on August 18, 2026.
- Backend syntax checks: `backend/server.js`, `backend/concord.js`, and `backend/store.js` parse cleanly.

## Not fully verified here

- Frontend dependency install and production build were not completed in this environment because `npm.cmd install` in `frontend/` did not finish before timeout.
- Solidity tests were not run because `forge` is not available in this workspace.

// indexer.js
// Watches InvoiceFactory.PaymentSwept on every configured chain and reports
// payments to the backend. This is the referee: it does not trust anyone's
// claim that a payment happened, only chain state.
//
// Two properties that matter for running this in production:
//
//   1. CHECKPOINTING - it records the last block processed per chain, so a
//      restart resumes from there instead of missing everything that
//      happened while it was down. The previous version used live .on()
//      listeners only, which silently lost every event during downtime.
//
//   2. IDEMPOTENCY - every event is keyed by (txHash, logIndex, chain) and
//      the backend rejects duplicates, so replaying a block range after a
//      crash cannot double-count a payment.

const { ethers } = require("ethers");
const store = require("./store");

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS;
if (!FACTORY_ADDRESS) throw new Error("FACTORY_ADDRESS required. See the repository README deployment section.");

const API_BASE = process.env.API_BASE
    || (process.env.API_HOSTPORT ? `http://${process.env.API_HOSTPORT}` : null)
    || "http://localhost:4000";
const INDEXER_SECRET = process.env.INDEXER_SECRET;
const POLL_INTERVAL = Number(process.env.INDEXER_POLL_MS || 12000);
const CONFIRMATIONS = Number(process.env.INDEXER_CONFIRMATIONS || 2);
const MAX_BLOCK_RANGE = Number(process.env.INDEXER_MAX_RANGE || 2000);

const CHAINS = [
    { name: "polygon", rpc: process.env.POLYGON_RPC_URL, chainId: 137 }
].filter(c => c.rpc);

const FACTORY_ABI = [
    "event PaymentSwept(bytes32 indexed invoiceId, address indexed token, uint256 amount, address sweptBy)",
    "event InvoiceRegistered(bytes32 indexed invoiceId, bytes32 commitment, address depositAddress)"
];

async function notifyBackend(body) {
    const res = await fetch(`${API_BASE}/indexer/payment`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(INDEXER_SECRET ? { "x-indexer-secret": INDEXER_SECRET } : {})
        },
        body: JSON.stringify(body)
    });
    if (!res.ok && res.status !== 409) {   // 409 = already processed, fine
        throw new Error(`backend rejected event: ${res.status} ${await res.text()}`);
    }
    return res.status;
}

async function scanChain(chain) {
    const provider = new ethers.JsonRpcProvider(chain.rpc);
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

    const head = await provider.getBlockNumber();
    const safeHead = head - CONFIRMATIONS;   // don't index reorg-able blocks

    let from = await store.getCheckpoint(chain.name);
    if (from === null) {
        // First run: start from the current head rather than genesis. Set
        // INDEXER_START_BLOCK to backfill from your deployment block instead.
        from = Number(process.env.INDEXER_START_BLOCK || safeHead);
        await store.setCheckpoint(chain.name, from);
        console.log(`[${chain.name}] no checkpoint, starting at block ${from}`);
    }

    if (from >= safeHead) return;   // nothing new yet

    // Chunk the range - most RPC providers cap getLogs spans.
    let cursor = from + 1;
    while (cursor <= safeHead) {
        const to = Math.min(cursor + MAX_BLOCK_RANGE - 1, safeHead);
        const events = await factory.queryFilter(factory.filters.PaymentSwept(), cursor, to);

        for (const ev of events) {
            const body = {
                invoiceIdHash: ev.args.invoiceId,
                chain: chain.name,
                chainId: chain.chainId,
                token: ev.args.token,
                amount: ev.args.amount.toString(),
                txHash: ev.transactionHash,
                logIndex: ev.index,
                blockNumber: ev.blockNumber
            };
            const status = await notifyBackend(body);
            console.log(`[${chain.name}] block ${ev.blockNumber} payment ${body.invoiceIdHash} -> backend ${status}`);
        }

        // Checkpoint only AFTER the events in this range are accepted. If we
        // crash mid-range the next run replays it, which is safe because the
        // backend dedupes on (txHash, logIndex, chain).
        await store.setCheckpoint(chain.name, to);
        cursor = to + 1;
    }
}

async function loop() {
    for (const chain of CHAINS) {
        try {
            await scanChain(chain);
        } catch (err) {
            // Never let one chain's RPC failure kill the whole indexer -
            // the checkpoint is untouched, so the next pass retries the
            // same range.
            console.error(`[${chain.name}] scan failed, will retry:`, err.message);
        }
    }
}

(async () => {
    await store.init();
    console.log(`Indexer watching ${CHAINS.length} chain(s) at ${FACTORY_ADDRESS}`);
    console.log(`Store: ${store.driver} · poll ${POLL_INTERVAL}ms · ${CONFIRMATIONS} confirmations`);
    if (store.driver === "memory") {
        console.warn("WARNING: STORE_DRIVER=memory - checkpoints are lost on restart. Set STORE_DRIVER=postgres.");
    }
    await loop();
    setInterval(loop, POLL_INTERVAL);
})();

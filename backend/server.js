// server.js
// Standalone invoice API (used directly, and also the shape milestone
// invoices follow inside concord.js) plus the indexer callback. All state
// goes through store.js now - restart no longer loses anything, and running
// STORE_DRIVER=postgres makes this a real backend rather than a demo.

require("express-async-errors");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { keccak256, getCreate2Address, toUtf8Bytes } = require("ethers");
const { registerOnChain, sweepOnChain } = require("./chain");
const { requireAuth, requireIndexer } = require("./auth");
const { rateLimit, validate, ID_PATTERN, securityHeaders } = require("./middleware");
const store = require("./store");

const app = express();
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
app.use(cors({
    origin(origin, callback) {
        if (!origin || (corsOrigins.length === 0 && process.env.NODE_ENV !== "production") || corsOrigins.includes(origin)) {
            return callback(null, true);
        }
        callback(new Error("origin not allowed"));
    }
}));
app.use(express.json({ limit: "256kb" }));
app.use(securityHeaders);
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// --- Config -----------------------------------------------------------
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "0x0000000000000000000000000000000000dEaD";
const SWEEPER_INIT_CODE_HASH = process.env.SWEEPER_INIT_CODE_HASH || "0x" + "0".repeat(64);

if (FACTORY_ADDRESS === "0x0000000000000000000000000000000000dEaD" && process.env.NODE_ENV === "production") {
    throw new Error("Refusing to start: FACTORY_ADDRESS unset in production.");
}
if (process.env.NODE_ENV === "production" && corsOrigins.length === 0) {
    throw new Error("Refusing to start: CORS_ORIGINS is required in production.");
}

function loadDataKey() {
    const configured = process.env.DATA_ENCRYPTION_KEY;
    let key;
    if (configured) {
        key = /^[0-9a-f]{64}$/i.test(configured)
            ? Buffer.from(configured, "hex")
            : Buffer.from(configured, "base64");
    } else {
        if (process.env.NODE_ENV === "production") {
            throw new Error("Refusing to start: DATA_ENCRYPTION_KEY (32 random bytes, hex or base64) is required in production.");
        }
        console.warn("Using a development-only encryption key. Stored documents will not be portable across environments.");
        key = crypto.createHash("sha256").update("concord-development-only-key").digest();
    }
    if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes.");
    return key;
}
const DATA_KEY = loadDataKey();

let PAYMENT_ASSETS = {};
try {
    PAYMENT_ASSETS = process.env.PAYMENT_ASSETS_JSON ? JSON.parse(process.env.PAYMENT_ASSETS_JSON) : {};
} catch {
    throw new Error("PAYMENT_ASSETS_JSON must be valid JSON.");
}
if (process.env.NODE_ENV === "production" && Object.keys(PAYMENT_ASSETS).length === 0) {
    throw new Error("Refusing to start: PAYMENT_ASSETS_JSON is required in production.");
}

function paymentAssetFor(chain) {
    const configured = PAYMENT_ASSETS[chain];
    if (!configured && process.env.NODE_ENV !== "production") {
        return { address: null, decimals: Number(process.env.PAYMENT_TOKEN_DECIMALS || 6), symbol: "DEV" };
    }
    return configured || null;
}

function isHexAddress(value) {
    return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function validateRuntimeConfig() {
    if (!isHexAddress(FACTORY_ADDRESS)) {
        throw new Error("FACTORY_ADDRESS must be a 20-byte hex address.");
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(SWEEPER_INIT_CODE_HASH)) {
        throw new Error("SWEEPER_INIT_CODE_HASH must be a 32-byte hex value.");
    }
    for (const [chain, asset] of Object.entries(PAYMENT_ASSETS)) {
        if (!asset || typeof asset !== "object") throw new Error(`PAYMENT_ASSETS_JSON.${chain} must be an object.`);
        if (!isHexAddress(asset.address)) throw new Error(`PAYMENT_ASSETS_JSON.${chain}.address must be a token address.`);
        if (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 18) {
            throw new Error(`PAYMENT_ASSETS_JSON.${chain}.decimals must be an integer between 0 and 18.`);
        }
        if (typeof asset.symbol !== "string" || !/^[A-Z0-9]{2,12}$/.test(asset.symbol)) {
            throw new Error(`PAYMENT_ASSETS_JSON.${chain}.symbol must be an uppercase token symbol.`);
        }
        if (process.env.NODE_ENV === "production") {
            const rpcVar = `${chain.toUpperCase().replace(/-/g, "_")}_RPC_URL`;
            if (!process.env[rpcVar]) throw new Error(`Refusing to start: ${rpcVar} is required for ${chain}.`);
        }
    }
    if (process.env.NODE_ENV === "production") {
        if (!process.env.REGISTRAR_PRIVATE_KEY || !/^0x[a-fA-F0-9]{64}$/.test(process.env.REGISTRAR_PRIVATE_KEY)) {
            throw new Error("Refusing to start: REGISTRAR_PRIVATE_KEY must be a 32-byte hex private key.");
        }
        if (!process.env.INDEXER_SECRET || process.env.INDEXER_SECRET.length < 16) {
            throw new Error("Refusing to start: INDEXER_SECRET must be at least 16 characters.");
        }
    }
}
validateRuntimeConfig();

const supportedSettlementSymbols = [...new Set(Object.values(PAYMENT_ASSETS).map(asset => String(asset.symbol || "").toUpperCase()).filter(Boolean))];

function isSupportedSettlementCurrency(currency) {
    if (supportedSettlementSymbols.length === 0) return process.env.NODE_ENV !== "production";
    return supportedSettlementSymbols.includes(String(currency || "").toUpperCase());
}

function decimalToUnits(value, decimals) {
    const source = String(value);
    if (!/^\d+(\.\d+)?$/.test(source)) throw new Error("invalid decimal amount");
    const [whole, fraction = ""] = source.split(".");
    if (fraction.length > decimals && /[^0]/.test(fraction.slice(decimals))) {
        throw new Error(`amount has more than ${decimals} decimal places`);
    }
    return BigInt(whole) * (10n ** BigInt(decimals))
        + BigInt((fraction.slice(0, decimals) + "0".repeat(decimals)).slice(0, decimals) || "0");
}

// --- Core: deterministic deposit address, identical to the Solidity ---
function depositAddressFor(invoiceId) {
    const idHash = keccak256(toUtf8Bytes(invoiceId));
    return getCreate2Address(FACTORY_ADDRESS, idHash, SWEEPER_INIT_CODE_HASH);
}

// --- Core: encrypt documents at rest and bind each wrapped key to an
// authenticated recipient. The backend remains the key custodian; access is
// enforced by verified Privy identity rather than caller-supplied secrets.
function wrappingKeyFor(recipientId) {
    return crypto.createHmac("sha256", DATA_KEY).update(`concord-wrap:${recipientId}`).digest();
}

function wrapDocumentKey(docKey, recipient) {
    const wrapIv = crypto.randomBytes(12);
    const wrapCipher = crypto.createCipheriv("aes-256-gcm", wrappingKeyFor(recipient.id), wrapIv);
    const wrapped = Buffer.concat([wrapCipher.update(docKey), wrapCipher.final()]);
    return {
        role: recipient.role,
        wrapped: wrapped.toString("hex"),
        iv: wrapIv.toString("hex"),
        authTag: wrapCipher.getAuthTag().toString("hex"),
        grantedAt: new Date().toISOString(),
        revoked: false
    };
}

function unwrapDocumentKey(grant, recipientId) {
    const decipher = crypto.createDecipheriv("aes-256-gcm", wrappingKeyFor(recipientId), Buffer.from(grant.iv, "hex"));
    decipher.setAuthTag(Buffer.from(grant.authTag, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(grant.wrapped, "hex")), decipher.final()]);
}

function encryptInvoice(invoiceJson, recipients) {
    const docKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", docKey, iv);
    const plaintext = Buffer.from(JSON.stringify(invoiceJson), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const wrappedKeys = {};
    for (const r of recipients) {
        wrappedKeys[r.id] = wrapDocumentKey(docKey, r);
    }

    const blob = { iv: iv.toString("hex"), authTag: authTag.toString("hex"), ciphertext: ciphertext.toString("hex") };
    const commitment = keccak256(Buffer.from(JSON.stringify(blob)));
    return { blob, commitment, wrappedKeys };
}

async function decryptInvoice(invoiceId, recipientId) {
    const record = await store.get("commitments", invoiceId);
    if (!record) throw new Error("not found");
    const grant = record.wrappedKeys[recipientId];
    if (!grant || grant.revoked) throw new Error("no access");

    const docKey = unwrapDocumentKey(grant, recipientId);

    const { blob } = record;
    const decipher = crypto.createDecipheriv("aes-256-gcm", docKey, Buffer.from(blob.iv, "hex"));
    decipher.setAuthTag(Buffer.from(blob.authTag, "hex"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(blob.ciphertext, "hex")), decipher.final()]);

    const recomputed = keccak256(Buffer.from(JSON.stringify(blob)));
    const verified = recomputed === record.commitment;
    return { invoice: JSON.parse(plaintext.toString("utf8")), verified };
}

// --- Routes -------------------------------------------------------------

app.post("/invoices", requireAuth, validate({
    invoiceId: { type: "string", required: true, pattern: ID_PATTERN, maxLength: 64 },
    seller: { type: "object", required: true },
    buyer: { type: "object", required: true },
    grossTotal: { type: "number", required: true, min: 0 },
    currency: { type: "string", required: true, maxLength: 8 },
    dueDate: { type: "string" },
    lineItems: { type: "array" },
    netTotal: { type: "number", min: 0 },
    taxTotal: { type: "number", min: 0 },
    settlement: { type: "object" }
}), async (req, res) => {
    const invoice = structuredClone(req.body);
    if (!invoice.seller?.id || !invoice.buyer?.id || !invoice.seller?.legalName || !invoice.buyer?.legalName) {
        return res.status(400).json({ error: "seller and buyer each require id and legalName" });
    }
    if (![invoice.seller.id, invoice.buyer.id].includes(req.userId)) {
        return res.status(403).json({ error: "only an invoice party can create it" });
    }

    const depositAddress = depositAddressFor(invoice.invoiceId);
    invoice.settlement = invoice.settlement || {};
    invoice.settlement.depositAddress = depositAddress;
    invoice.settlement.paymentTxHashes = [];
    invoice.status = "issued";
    invoice.createdBy = req.userId;
    invoice.ownerIds = [...new Set([invoice.seller.id, invoice.buyer.id])];
    invoice.history = [{ status: "issued", at: new Date().toISOString() }];

    const recipients = [
        { id: invoice.seller.id, role: "seller" },
        { id: invoice.buyer.id, role: "buyer" }
    ];
    const { blob, commitment, wrappedKeys } = encryptInvoice(invoice, recipients);

    if (!await store.putIfAbsent("invoices", invoice.invoiceId, invoice)) {
        return res.status(409).json({ error: "invoice exists" });
    }
    await store.put("commitments", invoice.invoiceId, {
        blob, commitment, wrappedKeys, adminIds: [req.userId]
    });

    const chainResult = await registerOnChain(invoice.invoiceId, commitment);
    invoice.settlement.commitmentOnChain = chainResult;
    await store.put("invoices", invoice.invoiceId, invoice);

    res.json({ invoiceId: invoice.invoiceId, depositAddress, commitment, status: "issued", chainResult });
});

app.get("/invoices", requireAuth, async (req, res) => {
    const all = await store.all("invoices");
    res.json(all.filter(inv => inv.ownerIds?.includes(req.userId)).map(inv => ({
        invoiceId: inv.invoiceId, status: inv.status, grossTotal: inv.grossTotal,
        currency: inv.currency, dueDate: inv.dueDate, depositAddress: inv.settlement.depositAddress
    })));
});

app.post("/invoices/:id/open", requireAuth, async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: "invalid invoice id" });
    try {
        const { invoice, verified } = await decryptInvoice(req.params.id, req.userId);
        res.json({ invoice, verified });
    } catch (e) {
        res.status(403).json({ error: "cannot open: no access or invoice not found" });
    }
});

app.post("/invoices/:id/grant", requireAuth, validate({
    recipientId: { type: "string", required: true, pattern: ID_PATTERN, maxLength: 64 },
    role: { type: "string", maxLength: 40 }
}), async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: "invalid invoice id" });
    const record = await store.get("commitments", req.params.id);
    if (!record) return res.status(404).json({ error: "not found" });
    const { recipientId, role } = req.body;
    if (!record.adminIds?.includes(req.userId)) return res.status(403).json({ error: "only the invoice creator can grant access" });

    const anyGrant = Object.values(record.wrappedKeys)[0];
    const anyGranteeId = Object.keys(record.wrappedKeys)[0];
    const docKey = unwrapDocumentKey(anyGrant, anyGranteeId);
    record.wrappedKeys[recipientId] = wrapDocumentKey(docKey, { id: recipientId, role: role || "viewer" });
    await store.put("commitments", req.params.id, record);
    res.json({ granted: recipientId, role });
});

app.post("/invoices/:id/revoke", requireAuth, validate({
    recipientId: { type: "string", required: true, pattern: ID_PATTERN, maxLength: 64 }
}), async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: "invalid invoice id" });
    const record = await store.get("commitments", req.params.id);
    if (!record) return res.status(404).json({ error: "not found" });
    const { recipientId } = req.body;
    if (!record.adminIds?.includes(req.userId)) return res.status(403).json({ error: "only the invoice creator can revoke access" });
    if (record.adminIds.includes(recipientId)) return res.status(400).json({ error: "cannot revoke the invoice administrator" });
    if (!record.wrappedKeys[recipientId]) return res.status(404).json({ error: "no such grant" });
    record.wrappedKeys[recipientId].revoked = true;
    await store.put("commitments", req.params.id, record);
    res.json({ revoked: recipientId });
});

app.get("/invoices/:id/address", (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: "invalid invoice id" });
    res.json({ invoiceId: req.params.id, depositAddress: depositAddressFor(req.params.id) });
});

// --- Indexer callback: chain truth arrives here, nowhere else. Guarded by
// requireIndexer so only the indexer process (holding INDEXER_SECRET) can
// call it - without this, anyone could POST a fake payment.
app.post("/indexer/payment", requireIndexer, async (req, res) => {
    const { invoiceIdHash, chain, token, amount, txHash, logIndex } = req.body;
    if (!invoiceIdHash || !txHash) return res.status(400).json({ error: "invoiceIdHash and txHash required" });

    // Idempotency: the indexer replays block ranges after a crash by design.
    // A duplicate (txHash, logIndex, chain) must be a no-op, not a double-count.
    const dedupeKey = `${chain}:${txHash}:${logIndex ?? 0}`;
    if (await store.get("commitments", `event:${dedupeKey}`)) {
        return res.status(409).json({ error: "already processed" });
    }

    const all = await store.all("invoices");
    const matched = all.find(inv => keccak256(toUtf8Bytes(inv.invoiceId)) === invoiceIdHash);
    if (!matched) return res.status(404).json({ error: "unknown invoice hash - was it registered?" });

    const asset = paymentAssetFor(chain);
    if (!asset || asset.address && String(asset.address).toLowerCase() !== String(token).toLowerCase()) {
        await store.putIfAbsent("commitments", `event:${dedupeKey}`, {
            processedAt: new Date().toISOString(), ignored: true, reason: "unsupported payment asset"
        });
        return res.status(202).json({ ignored: true, reason: "unsupported payment asset" });
    }

    let received;
    try {
        received = BigInt(amount);
        if (received <= 0n) throw new Error("non-positive amount");
    } catch {
        return res.status(400).json({ error: "amount must be a positive integer in base units" });
    }

    if (!await store.putIfAbsent("commitments", `event:${dedupeKey}`, {
        processedAt: new Date().toISOString(), processing: true
    })) return res.status(409).json({ error: "already processed" });

    try {
        matched.settlement = matched.settlement || {};
        matched.settlement.paymentTxHashes = matched.settlement.paymentTxHashes || [];
        matched.settlement.paymentTxHashes.push({ chain, txHash, token, amount: received.toString() });
        const amountReceived = BigInt(matched.settlement.amountReceived || 0) + received;
        matched.settlement.amountReceived = amountReceived.toString();
        matched.settlement.asset = asset.symbol || token;
        matched.settlement.decimals = Number(asset.decimals);
        const expected = decimalToUnits(matched.grossTotal, Number(asset.decimals));
        matched.status = amountReceived >= expected ? "paid" : "underpaid";
        matched.history = matched.history || [];
        matched.history.push({ status: matched.status, at: new Date().toISOString(), txHash });
        await store.put("invoices", matched.invoiceId, matched);

        if (matched.concordId) {
            const concord = await store.get("concords", matched.concordId);
            const milestone = concord?.frozenContract?.milestoneInvoices?.find(m => m.invoiceId === matched.invoiceId);
            if (milestone) {
                milestone.amountReceived = matched.settlement.amountReceived;
                milestone.paymentTxHashes = matched.settlement.paymentTxHashes;
                milestone.status = matched.status;
                const allPaid = concord.frozenContract.milestoneInvoices.every(m => m.status === "paid" || m.status === "settled");
                concord.status = allPaid ? "funded" : "partially_funded";
                concord.history.push({ event: "payment_confirmed", invoiceId: matched.invoiceId, status: matched.status, txHash, chain, at: new Date().toISOString() });
                await store.put("concords", concord.concordId, concord);
            }
        }

        await store.put("commitments", `event:${dedupeKey}`, { processedAt: new Date().toISOString() });
        res.json({ invoiceId: matched.invoiceId, status: matched.status, amountReceived: matched.settlement.amountReceived });
    } catch (error) {
        await store.delete("commitments", `event:${dedupeKey}`);
        throw error;
    }
});

// --- Negotiation layer, chat, drafting ---
const concordRouter = require("./concord")({
    depositAddressFor,
    encryptInvoice,
    sweepOnChain,
    paymentAssetFor,
    isSupportedSettlementCurrency
});
app.use("/", concordRouter);

const chatRouter = require("./chat")({ getConcord: concordRouter.getConcord, requireParty: concordRouter.requireParty });
app.use("/", chatRouter);

const draftRouter = require("./draft")({
    getThread: chatRouter.getThread,
    getConcord: concordRouter.getConcord,
    requireParty: concordRouter.requireParty
});
app.use("/", draftRouter);

app.get("/health", async (req, res) => {
    res.json({ ok: true, store: store.driver, auth: "privy" });
});

app.get("/ready", async (req, res) => {
    try {
        await store.ping();
        res.json({ ready: true });
    } catch {
        res.status(503).json({ ready: false });
    }
});

app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    const status = err.type === "entity.parse.failed" ? 400 : err.message === "origin not allowed" ? 403 : 500;
    res.status(status).json({ error: status === 500 ? "internal server error" : err.message });
});

(async () => {
    await store.init();
    const PORT = process.env.PORT || 4000;
    const server = app.listen(PORT, () => {
        console.log(`Invoice API on :${PORT} · store=${store.driver} · auth=privy`);
    });
    const shutdown = () => server.close(async () => { await store.close(); process.exit(0); });
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
})();

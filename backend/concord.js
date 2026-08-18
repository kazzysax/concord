// concord.js
// Negotiation -> mutual consent -> signed deed -> per-milestone invoices.
// All state is persisted through store.js, so a restart no longer loses
// every deal in flight.

const crypto = require("crypto");
const { ethers } = require("ethers");
const { requireAuth, optionalAuth } = require("./auth");
const { registerOnChain } = require("./chain");
const { rateLimit, validate, ID_PATTERN } = require("./middleware");
const store = require("./store");

module.exports = function concordRouter({ depositAddressFor, encryptInvoice, sweepOnChain, paymentAssetFor, isSupportedSettlementCurrency }) {
    const express = require("express");
    const router = express.Router();

    const isParty = (c, userId) =>
        [c.parties.merchant.id, c.parties.client?.id].filter(Boolean).includes(userId);

    // Loads the concord and checks membership in one step so no route can
    // forget the authorization check.
    async function loadForParty(req, res) {
        const concord = await store.get("concords", req.params.id);
        if (!concord) { res.status(404).json({ error: "not found" }); return null; }
        if (!isParty(concord, req.userId)) { res.status(403).json({ error: "not a party" }); return null; }
        return concord;
    }

    const writeLimit = rateLimit({ windowMs: 60_000, max: 60 });
    const signaturesRequired = process.env.NODE_ENV === "production" || process.env.REQUIRE_SIGNATURES === "true";

    router.post("/concords", requireAuth, writeLimit,
        validate({
            concordId: { required: true, type: "string", pattern: ID_PATTERN },
            merchantLegalName: { type: "string", maxLength: 200 }
        }),
        async (req, res) => {
            const { concordId, merchantLegalName } = req.body;
            const token = crypto.randomBytes(32).toString("base64url");

            const concord = {
                concordId,
                status: "negotiating",
                parties: {
                    merchant: { id: req.userId, legalName: merchantLegalName || req.userId },
                    client: null
                },
                termsVersions: [],
                subcontracts: [],
                frozenContract: null,
                inviteTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
                inviteUsedAt: null,
                history: [{ event: "concord_opened", by: req.userId, at: new Date().toISOString() }]
            };
            if (!await store.putIfAbsent("concords", concordId, concord)) {
                return res.status(409).json({ error: "concord exists" });
            }

            res.json({ concordId, status: "negotiating", inviteLink: `/c/${concordId}?token=${token}` });
        });

    // The one link, for the whole life of the deal. First click from a new
    // user consumes the token and binds them as client.
    router.get("/concords/:id/resolve", optionalAuth, async (req, res) => {
        let concord = await store.get("concords", req.params.id);
        if (!concord) return res.status(404).json({ error: "not found" });
        if (!req.userId) return res.json({ requiresLogin: true, concordId: concord.concordId });

        const { token } = req.query;
        if (token && !concord.parties.client && req.userId !== concord.parties.merchant.id) {
            const suppliedHash = crypto.createHash("sha256").update(token).digest("hex");
            const expected = Buffer.from(concord.inviteTokenHash || "", "hex");
            const supplied = Buffer.from(suppliedHash, "hex");
            if (expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied)) {
                const joinedAt = new Date().toISOString();
                const claimed = await store.claimConcordInvite(
                    concord.concordId,
                    suppliedHash,
                    { id: req.userId, legalName: req.wallet || req.userId },
                    joinedAt
                );
                concord = claimed || await store.get("concords", req.params.id);
            }
        }

        if (!isParty(concord, req.userId)) {
            return res.status(403).json({ error: "not a party to this concord - ask for a valid invite link" });
        }

        let destination = "conference_room";
        if (concord.status === "agreed") destination = "contract";
        if (concord.status === "funded" || concord.status === "partially_funded") destination = "payment";
        if (concord.status === "fulfilled") destination = "settled";

        res.json({
            concordId: concord.concordId, status: concord.status, destination,
            role: req.userId === concord.parties.merchant.id ? "merchant" : "client"
        });
    });

    router.post("/concords/:id/propose", requireAuth, writeLimit,
        validate({ terms: { required: true, type: "object" }, diffFrom: {}, changes: {} }),
        async (req, res) => {
            const concord = await loadForParty(req, res); if (!concord) return;
            if (concord.frozenContract) return res.status(409).json({ error: "already frozen" });

            const { terms, diffFrom, changes } = req.body;
            if (typeof terms.description !== "string" || !terms.description.trim() || terms.description.length > 2000) {
                return res.status(400).json({ error: "terms.description is required and must be at most 2000 characters" });
            }
            if (!Number.isFinite(terms.totalValue) || terms.totalValue <= 0) {
                return res.status(400).json({ error: "terms.totalValue must be a positive number" });
            }
            if (typeof terms.currency !== "string" || !/^[A-Z]{3,8}$/.test(terms.currency)) {
                return res.status(400).json({ error: "terms.currency must be an uppercase currency or asset code" });
            }
            if (isSupportedSettlementCurrency && !isSupportedSettlementCurrency(terms.currency)) {
                return res.status(400).json({ error: "terms.currency must match a configured settlement asset symbol" });
            }
            if (!Array.isArray(terms.milestones) || terms.milestones.length === 0) {
                return res.status(400).json({ error: "terms.milestones must be a non-empty array" });
            }
            if (terms.milestones.length > 50 || terms.milestones.some(m =>
                !m || !ID_PATTERN.test(String(m.id || "")) || typeof m.label !== "string" || !m.label.trim()
                || m.label.length > 200 || !Number.isFinite(Number(m.percent)) || Number(m.percent) <= 0
            )) {
                return res.status(400).json({ error: "each milestone needs a valid id, label, and positive percentage" });
            }
            if (new Set(terms.milestones.map(m => m.id)).size !== terms.milestones.length) {
                return res.status(400).json({ error: "milestone ids must be unique" });
            }
            const sum = terms.milestones.reduce((s, m) => s + Number(m.percent || 0), 0);
            if (Math.abs(sum - 100) > 0.01) {
                return res.status(400).json({ error: `milestone percentages must sum to 100, got ${sum}` });
            }

            const version = concord.termsVersions.length + 1;
            const entry = {
                version, proposedBy: req.userId, terms,
                diffFrom: diffFrom || null, changes: changes || null,
                at: new Date().toISOString(), acceptedBy: [], consents: {}, signatures: {}
            };
            concord.termsVersions.push(entry);
            // A new proposal invalidates all prior consent - you can't consent
            // to v2 and have it silently carry to v3.
            concord.termsVersions.forEach(v => { if (v.version !== version) v.consents = {}; });
            concord.history.push({ event: version === 1 ? "terms_proposed" : "counter_proposed", version, by: req.userId, at: entry.at });

            await store.put("concords", concord.concordId, concord);
            res.json({ version, acceptedBy: entry.acceptedBy });
        });

    // Real e-signing: the wallet signs keccak256(terms JSON). We recover the
    // signer and require it to match the authenticated wallet.
    router.post("/concords/:id/accept", requireAuth, writeLimit,
        validate({ version: { required: true, type: "number" }, signature: { type: "string", maxLength: 500 } }),
        async (req, res) => {
            const concord = await loadForParty(req, res); if (!concord) return;
            if (concord.frozenContract) return res.status(409).json({ error: "already frozen" });

            const { version, signature } = req.body;
            const entry = concord.termsVersions.find(v => v.version === version);
            if (!entry) return res.status(404).json({ error: "no such version" });
            const latest = concord.termsVersions[concord.termsVersions.length - 1];
            if (entry.version !== latest.version) return res.status(409).json({ error: "only the latest terms version can be accepted" });

            let signatureVerified = false;
            if (signature) {
                try {
                    const termsHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(entry.terms)));
                    const recovered = ethers.verifyMessage(termsHash, signature);
                    signatureVerified = !!req.wallet && recovered.toLowerCase() === req.wallet.toLowerCase();
                    if (!signatureVerified) return res.status(400).json({ error: "signature does not match your wallet" });
                } catch {
                    return res.status(400).json({ error: "invalid signature" });
                }
            } else if (signaturesRequired) {
                return res.status(400).json({ error: "signature required" });
            }

            entry.signatures = entry.signatures || {};
            entry.signatures[req.userId] = {
                signature: signature || null, verified: signatureVerified,
                wallet: req.wallet || null, at: new Date().toISOString()
            };
            if (!entry.acceptedBy.includes(req.userId)) entry.acceptedBy.push(req.userId);
            concord.history.push({ event: "accepted", version, by: req.userId, verified: signatureVerified, at: new Date().toISOString() });

            await store.put("concords", concord.concordId, concord);

            const bothIds = [concord.parties.merchant.id, concord.parties.client?.id].filter(Boolean);
            const readyToFreeze = bothIds.length === 2 && bothIds.every(id => entry.acceptedBy.includes(id));
            res.json({ version, acceptedBy: entry.acceptedBy, signatureVerified, readyToFreeze });
        });

    // The consent gate. Nothing reaches the chain without both parties
    // explicitly confirming no further changes.
    router.post("/concords/:id/consent", requireAuth, writeLimit,
        validate({ version: { required: true, type: "number" }, confirmed: { required: true, type: "boolean" } }),
        async (req, res) => {
            const concord = await loadForParty(req, res); if (!concord) return;
            if (concord.frozenContract) return res.status(409).json({ error: "already frozen" });
            if (!req.body.confirmed) return res.status(400).json({ error: "consent requires explicit confirmation" });

            const entry = concord.termsVersions.find(v => v.version === req.body.version);
            if (!entry) return res.status(404).json({ error: "no such version" });
            const latest = concord.termsVersions[concord.termsVersions.length - 1];
            if (entry.version !== latest.version) return res.status(409).json({ error: "only the latest terms version can receive consent" });
            if (!entry.acceptedBy.includes(req.userId)) {
                return res.status(409).json({ error: "accept and sign this version before consenting" });
            }

            entry.consents = entry.consents || {};
            entry.consents[req.userId] = { confirmed: true, at: new Date().toISOString() };
            concord.history.push({ event: "consented", version: entry.version, by: req.userId, at: new Date().toISOString() });
            await store.put("concords", concord.concordId, concord);

            const bothIds = [concord.parties.merchant.id, concord.parties.client?.id].filter(Boolean);
            const allConsented = bothIds.length === 2 && bothIds.every(id => entry.consents[id]?.confirmed);
            res.json({ version: entry.version, consents: entry.consents, allConsented });
        });

    router.post("/concords/:id/withdraw-consent", requireAuth, writeLimit,
        validate({ version: { required: true, type: "number" } }),
        async (req, res) => {
            const concord = await loadForParty(req, res); if (!concord) return;
            if (concord.frozenContract) return res.status(409).json({ error: "already frozen - too late to withdraw" });

            const entry = concord.termsVersions.find(v => v.version === req.body.version);
            if (!entry?.consents?.[req.userId]) return res.status(404).json({ error: "no consent to withdraw" });
            const latest = concord.termsVersions[concord.termsVersions.length - 1];
            if (entry.version !== latest.version) return res.status(409).json({ error: "only the latest terms version can be changed" });

            delete entry.consents[req.userId];
            concord.history.push({ event: "consent_withdrawn", version: entry.version, by: req.userId, at: new Date().toISOString() });
            await store.put("concords", concord.concordId, concord);
            res.json({ version: entry.version, consents: entry.consents, allConsented: false });
        });

    router.post("/concords/:id/freeze", requireAuth, writeLimit, async (req, res) => {
        let concord = await loadForParty(req, res); if (!concord) return;
        if (concord.frozenContract) return res.status(409).json({ error: "already frozen" });

        const bothIds = [concord.parties.merchant.id, concord.parties.client?.id].filter(Boolean);
        const version = concord.termsVersions[concord.termsVersions.length - 1];
        if (!version || bothIds.length !== 2 || !bothIds.every(id => version.acceptedBy.includes(id))) {
            return res.status(400).json({ error: "the latest version has not been accepted by both parties" });
        }
        if (signaturesRequired && !bothIds.every(id => version.signatures?.[id]?.verified)) {
            return res.status(400).json({ error: "both parties must provide verified wallet signatures" });
        }

        const allConsented = version.consents && bothIds.every(id => version.consents[id]?.confirmed);
        if (!allConsented) {
            return res.status(400).json({
                error: "both parties must consent before this can be recorded on-chain",
                awaitingConsentFrom: bothIds.filter(id => !version.consents?.[id]?.confirmed)
            });
        }

        // Claim the freeze before doing slow chain work, so two concurrent
        // requests can't both register the same contract.
        const freezeClaim = { pending: true, claimedAt: new Date().toISOString(), claimedBy: req.userId };
        concord = await store.claimConcordFreeze(concord.concordId, freezeClaim);
        if (!concord) return res.status(409).json({ error: "freeze already in progress or completed" });

        try {
            const contractId = `${concord.concordId}-v${version.version}`;
            const recipients = bothIds.map(id => ({
                id, role: id === concord.parties.merchant.id ? "merchant" : "client"
            }));

            const milestoneInvoices = [];
            for (const m of version.terms.milestones) {
                const invoiceId = `${concord.concordId}-${m.id}`;
                const amountDue = +(version.terms.totalValue * (m.percent / 100)).toFixed(2);
                const payload = { invoiceId, contractId, label: m.label, amountDue, currency: version.terms.currency, dueOn: m.dueOn };
                const { blob, commitment, wrappedKeys } = encryptInvoice(payload, recipients);
                await store.put("commitments", invoiceId, { blob, commitment, wrappedKeys, adminIds: bothIds });
                const chainResult = await registerOnChain(invoiceId, commitment);
                const milestoneInvoice = {
                    milestoneId: m.id, invoiceId, label: m.label, amountDue,
                    currency: version.terms.currency, depositAddress: depositAddressFor(invoiceId),
                    status: "pending", dueOn: m.dueOn, amountReceived: 0,
                    paymentTxHashes: [], commitment, commitmentOnChain: chainResult
                };
                milestoneInvoices.push(milestoneInvoice);
                await store.put("invoices", invoiceId, {
                    ...milestoneInvoice,
                    grossTotal: amountDue,
                    concordId: concord.concordId,
                    contractId,
                    ownerIds: bothIds,
                    createdBy: req.userId,
                    settlement: {
                        depositAddress: milestoneInvoice.depositAddress,
                        paymentTxHashes: [],
                        amountReceived: "0"
                    },
                    history: [{ status: "issued", at: new Date().toISOString() }]
                });
            }

            const frozen = {
                contractId, frozenFrom: version.version, frozenAt: new Date().toISOString(),
                terms: version.terms, milestoneInvoices,
                signatures: version.signatures || {}, consents: version.consents || {}
            };
            const { blob, commitment, wrappedKeys } = encryptInvoice(frozen, recipients);
            await store.put("commitments", contractId, { blob, commitment, wrappedKeys, adminIds: bothIds });

            frozen.commitment = commitment;
            frozen.commitmentOnChain = await registerOnChain(contractId, commitment);

            concord.frozenContract = frozen;
            concord.status = "agreed";
            concord.history.push({ event: "frozen", contractId, commitment, at: frozen.frozenAt });
            await store.put("concords", concord.concordId, concord);

            res.json({ contractId, commitment, commitmentOnChain: frozen.commitmentOnChain, milestoneInvoices, status: "agreed" });
        } catch (err) {
            // Release the claim so a retry is possible rather than leaving
            // the concord permanently stuck in "pending".
            concord.frozenContract = null;
            await store.put("concords", concord.concordId, concord);
            res.status(500).json({ error: "freeze failed", detail: err.message });
        }
    });

    // Subcontracts: addenda to a frozen deed, same double-consent rule.
    router.post("/concords/:id/subcontract", requireAuth, writeLimit,
        validate({ terms: { required: true, type: "object" } }),
        async (req, res) => {
            const concord = await loadForParty(req, res); if (!concord) return;
            if (!concord.frozenContract || concord.frozenContract.pending) {
                return res.status(400).json({ error: "no frozen parent contract to extend" });
            }

            concord.subcontracts = concord.subcontracts || [];
            const sub = {
                subcontractId: `${concord.frozenContract.contractId}-sub${concord.subcontracts.length + 1}`,
                parentContractId: concord.frozenContract.contractId,
                proposedBy: req.userId, terms: req.body.terms,
                consents: { [req.userId]: { confirmed: true, at: new Date().toISOString() } },
                frozen: false, at: new Date().toISOString()
            };
            concord.subcontracts.push(sub);
            concord.history.push({ event: "subcontract_proposed", subcontractId: sub.subcontractId, by: req.userId, at: sub.at });
            await store.put("concords", concord.concordId, concord);
            res.json(sub);
        });

    // Payments sent to counterfactual milestone addresses are recognized
    // after the Sweeper is deployed and called. Either party can ask the
    // backend relayer to do that; the contract itself keeps the action
    // permissionless and the indexer remains the source of payment truth.
    router.post("/concords/:id/milestones/:milestoneId/sweep", requireAuth, writeLimit,
        validate({ chain: { required: true, type: "string", maxLength: 64 } }),
        async (req, res) => {
            const concord = await loadForParty(req, res); if (!concord) return;
            const milestone = concord.frozenContract?.milestoneInvoices?.find(m => m.milestoneId === req.params.milestoneId);
            if (!milestone) return res.status(404).json({ error: "no such frozen milestone" });
            const asset = paymentAssetFor(req.body.chain);
            if (!asset?.address) return res.status(400).json({ error: "no settlement asset configured for that chain" });
            try {
                const sweep = await sweepOnChain(milestone.invoiceId, req.body.chain, asset.address);
                res.status(202).json({ submitted: true, sweep });
            } catch (error) {
                const nothingToSweep = /nothing to sweep|execution reverted/i.test(error.message);
                res.status(nothingToSweep ? 409 : 502).json({
                    error: nothingToSweep ? "no confirmed balance is available to sweep" : "sweep transaction failed"
                });
            }
        });

    router.post("/concords/:id/subcontract/:subId/consent", requireAuth, writeLimit,
        validate({ confirmed: { required: true, type: "boolean" } }),
        async (req, res) => {
            const concord = await loadForParty(req, res); if (!concord) return;
            if (!req.body.confirmed) return res.status(400).json({ error: "consent requires explicit confirmation" });

            const sub = (concord.subcontracts || []).find(s => s.subcontractId === req.params.subId);
            if (!sub) return res.status(404).json({ error: "no such subcontract" });
            if (sub.frozen) return res.status(409).json({ error: "already frozen" });

            sub.consents[req.userId] = { confirmed: true, at: new Date().toISOString() };
            const bothIds = [concord.parties.merchant.id, concord.parties.client?.id].filter(Boolean);
            const allConsented = bothIds.length === 2 && bothIds.every(id => sub.consents[id]?.confirmed);

            if (allConsented) {
                const recipients = bothIds.map(id => ({
                    id, role: id === concord.parties.merchant.id ? "merchant" : "client"
                }));
                const { blob, commitment, wrappedKeys } = encryptInvoice(sub, recipients);
                await store.put("commitments", sub.subcontractId, { blob, commitment, wrappedKeys, adminIds: bothIds });
                sub.commitment = commitment;
                sub.commitmentOnChain = await registerOnChain(sub.subcontractId, commitment);
                sub.frozen = true;
                sub.frozenAt = new Date().toISOString();
                concord.history.push({ event: "subcontract_frozen", subcontractId: sub.subcontractId, commitment, at: sub.frozenAt });
            }

            await store.put("concords", concord.concordId, concord);
            res.json({ subcontractId: sub.subcontractId, consents: sub.consents, allConsented, frozen: sub.frozen });
        });

    router.get("/concords/:id", requireAuth, async (req, res) => {
        const concord = await loadForParty(req, res); if (!concord) return;
        const { inviteTokenHash, ...safeConcord } = concord;
        res.json(safeConcord);
    });

    router.get("/concords", requireAuth, async (req, res) => {
        const all = await store.all("concords");
        const mine = all.filter(c => isParty(c, req.userId));
        res.json(mine.map(c => ({
            concordId: c.concordId, status: c.status,
            merchant: c.parties.merchant.legalName,
            client: c.parties.client?.legalName || "awaiting join",
            versionCount: c.termsVersions.length,
            contractId: c.frozenContract?.contractId || null
        })));
    });

    router.getConcord = (id) => store.get("concords", id);
    router.isParty = isParty;
    router.requireParty = isParty;
    return router;
};

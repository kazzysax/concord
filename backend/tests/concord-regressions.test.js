const { test } = require("node:test");
const assert = require("node:assert");

process.env.STORE_DRIVER = "memory";
process.env.NODE_ENV = "test";

const storePath = require.resolve("../store");
const concordPath = require.resolve("../concord");

function loadFresh() {
    delete require.cache[storePath];
    delete require.cache[concordPath];
    const store = require("../store");
    const router = buildRouter();
    return { store, router };
}

function buildRouter() {
    return require("../concord")({
        depositAddressFor: (id) => `0xDEPOSIT-${id}`,
        encryptInvoice: () => ({ blob: {}, commitment: "0xcommit", wrappedKeys: {} }),
        paymentAssetFor: () => ({ address: "0x0000000000000000000000000000000000000001", decimals: 6, symbol: "USDC" }),
        isSupportedSettlementCurrency: (currency) => currency === "USDC"
    });
}

function mockRes() {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

function findHandler(router, method, path) {
    const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
}

async function run(router, method, path, req) {
    const res = mockRes();
    await findHandler(router, method, path)(req, res, () => {});
    return res;
}

async function seedDeal(router, store, dealId) {
    await run(router, "post", "/concords", { userId: "merchant", body: { concordId: dealId, merchantLegalName: "Acme" } });
    const concord = await store.get("concords", dealId);
    concord.parties.client = { id: "client", legalName: "Client Co" };
    await store.put("concords", dealId, concord);
}

test("proposer is not auto-accepted", async () => {
    const { store, router } = loadFresh();
    await seedDeal(router, store, "deal-auto");
    const res = await run(router, "post", "/concords/:id/propose", {
        userId: "merchant",
        params: { id: "deal-auto" },
        body: { terms: { description: "work", totalValue: 100, currency: "USDC", milestones: [{ id: "m1", label: "all", percent: 100, dueOn: "signing" }] } }
    });
    assert.deepStrictEqual(res.body.acceptedBy, []);
});

test("consent requires prior acceptance", async () => {
    const { store, router } = loadFresh();
    await seedDeal(router, store, "deal-consent");
    await run(router, "post", "/concords/:id/propose", {
        userId: "merchant",
        params: { id: "deal-consent" },
        body: { terms: { description: "work", totalValue: 100, currency: "USDC", milestones: [{ id: "m1", label: "all", percent: 100, dueOn: "signing" }] } }
    });
    const res = await run(router, "post", "/concords/:id/consent", {
        userId: "client",
        params: { id: "deal-consent" },
        body: { version: 1, confirmed: true }
    });
    assert.strictEqual(res.statusCode, 409);
});

test("old versions cannot be accepted after a counterproposal", async () => {
    const { store, router } = loadFresh();
    await seedDeal(router, store, "deal-latest");
    await run(router, "post", "/concords/:id/propose", {
        userId: "merchant",
        params: { id: "deal-latest" },
        body: { terms: { description: "v1", totalValue: 100, currency: "USDC", milestones: [{ id: "m1", label: "all", percent: 100, dueOn: "signing" }] } }
    });
    await run(router, "post", "/concords/:id/propose", {
        userId: "client",
        params: { id: "deal-latest" },
        body: { terms: { description: "v2", totalValue: 200, currency: "USDC", milestones: [{ id: "m1", label: "all", percent: 100, dueOn: "signing" }] }, diffFrom: 1 }
    });
    const res = await run(router, "post", "/concords/:id/accept", {
        userId: "merchant",
        params: { id: "deal-latest" },
        body: { version: 1 }
    });
    assert.strictEqual(res.statusCode, 409);
});

test("invite token survives router restart because it is stored with the concord", async () => {
    const { store, router } = loadFresh();
    const create = await run(router, "post", "/concords", { userId: "merchant", body: { concordId: "deal-invite", merchantLegalName: "Acme" } });
    const token = new URL(`https://example.test${create.body.inviteLink}`).searchParams.get("token");
    delete require.cache[concordPath];
    const routerAfterRestart = buildRouter();
    const res = await run(routerAfterRestart, "get", "/concords/:id/resolve", {
        userId: "client",
        wallet: "0xclient",
        params: { id: "deal-invite" },
        query: { token }
    });
    assert.strictEqual(res.statusCode, 200);
    const saved = await store.get("concords", "deal-invite");
    assert.strictEqual(saved.parties.client.id, "client");
});

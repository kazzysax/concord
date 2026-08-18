// consent-gate.test.js
// This is the highest-stakes logic in the app: nothing should be able to
// reach the chain without BOTH parties explicitly consenting to a SPECIFIC
// version. These tests exercise that state machine directly against
// concord.js's router, using the memory store driver.

const { test } = require("node:test");
const assert = require("node:assert");

process.env.STORE_DRIVER = "memory";
process.env.NODE_ENV = "test";
// concord.js awaits registerOnChain - chain.js degrades to a no-op without
// these, which is exactly right for a test that shouldn't touch a real chain.
delete process.env.FACTORY_ADDRESS;
delete process.env.REGISTRAR_PRIVATE_KEY;

const store = require("../store");
const concordRouterFactory = require("../concord");

function mockRes() {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}

// Pulls a specific route handler out of the Express router by method+path,
// bypassing actual HTTP so tests run without a listening server.
function findHandler(router, method, path) {
    const layer = router.stack.find(l =>
        l.route && l.route.path === path && l.route.methods[method]
    );
    if (!layer) throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
    // Last handler in the stack is the actual route logic; earlier ones are
    // middleware (requireAuth, rateLimit, validate) which we skip by
    // injecting req.userId directly instead of going through real auth.
    return layer.route.stack[layer.route.stack.length - 1].handle;
}

async function run(router, method, path, req) {
    const handler = findHandler(router, method, path);
    const res = mockRes();
    await handler(req, res, () => {});
    return res;
}

test("consent gate: freeze fails with zero consents", async () => {
    const depositAddressFor = (id) => `0xDEPOSIT-${id}`;
    const encryptInvoice = () => ({ blob: {}, commitment: "0xcommit", wrappedKeys: {} });
    const router = concordRouterFactory({ depositAddressFor, encryptInvoice });

    await run(router, "post", "/concords", { userId: "merchant-1", body: { concordId: "test-deal-1", merchantLegalName: "Acme" } });
    let concord = await store.get("concords", "test-deal-1");
    concord.parties.client = { id: "client-1", legalName: "Client Co" };
    await store.put("concords", "test-deal-1", concord);

    await run(router, "post", "/concords/:id/propose", {
        userId: "merchant-1", params: { id: "test-deal-1" },
        body: { terms: { description: "test", totalValue: 100, currency: "USD", milestones: [{ id: "m1", label: "all", percent: 100, dueOn: "signing" }] } }
    });
    await run(router, "post", "/concords/:id/accept", { userId: "merchant-1", params: { id: "test-deal-1" }, body: { version: 1 } });
    await run(router, "post", "/concords/:id/accept", { userId: "client-1", params: { id: "test-deal-1" }, body: { version: 1 } });

    const res = await run(router, "post", "/concords/:id/freeze", { userId: "merchant-1", params: { id: "test-deal-1" }, body: {} });
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes("consent"));
});

test("consent gate: freeze fails with only ONE party's consent", async () => {
    const depositAddressFor = (id) => `0xDEPOSIT-${id}`;
    const encryptInvoice = () => ({ blob: {}, commitment: "0xcommit", wrappedKeys: {} });
    const router = concordRouterFactory({ depositAddressFor, encryptInvoice });

    await run(router, "post", "/concords", { userId: "merchant-2", body: { concordId: "test-deal-2", merchantLegalName: "Acme" } });
    let concord = await store.get("concords", "test-deal-2");
    concord.parties.client = { id: "client-2", legalName: "Client Co" };
    await store.put("concords", "test-deal-2", concord);

    await run(router, "post", "/concords/:id/propose", {
        userId: "merchant-2", params: { id: "test-deal-2" },
        body: { terms: { description: "test", totalValue: 100, currency: "USD", milestones: [{ id: "m1", label: "all", percent: 100, dueOn: "signing" }] } }
    });
    await run(router, "post", "/concords/:id/accept", { userId: "merchant-2", params: { id: "test-deal-2" }, body: { version: 1 } });
    await run(router, "post", "/concords/:id/accept", { userId: "client-2", params: { id: "test-deal-2" }, body: { version: 1 } });

    // Only the merchant consents.
    await run(router, "post", "/concords/:id/consent", { userId: "merchant-2", params: { id: "test-deal-2" }, body: { version: 1, confirmed: true } });

    const res = await run(router, "post", "/concords/:id/freeze", { userId: "merchant-2", params: { id: "test-deal-2" }, body: {} });
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body.awaitingConsentFrom, ["client-2"]);
});

test("consent gate: freeze succeeds once BOTH parties consent", async () => {
    const depositAddressFor = (id) => `0xDEPOSIT-${id}`;
    const encryptInvoice = () => ({ blob: {}, commitment: "0xcommit", wrappedKeys: {} });
    const router = concordRouterFactory({ depositAddressFor, encryptInvoice });

    await run(router, "post", "/concords", { userId: "merchant-3", body: { concordId: "test-deal-3", merchantLegalName: "Acme" } });
    let concord = await store.get("concords", "test-deal-3");
    concord.parties.client = { id: "client-3", legalName: "Client Co" };
    await store.put("concords", "test-deal-3", concord);

    await run(router, "post", "/concords/:id/propose", {
        userId: "merchant-3", params: { id: "test-deal-3" },
        body: { terms: { description: "test", totalValue: 100, currency: "USD", milestones: [{ id: "m1", label: "all", percent: 100, dueOn: "signing" }] } }
    });
    await run(router, "post", "/concords/:id/accept", { userId: "merchant-3", params: { id: "test-deal-3" }, body: { version: 1 } });
    await run(router, "post", "/concords/:id/accept", { userId: "client-3", params: { id: "test-deal-3" }, body: { version: 1 } });
    await run(router, "post", "/concords/:id/consent", { userId: "merchant-3", params: { id: "test-deal-3" }, body: { version: 1, confirmed: true } });
    await run(router, "post", "/concords/:id/consent", { userId: "client-3", params: { id: "test-deal-3" }, body: { version: 1, confirmed: true } });

    const res = await run(router, "post", "/concords/:id/freeze", { userId: "merchant-3", params: { id: "test-deal-3" }, body: {} });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.contractId.includes("test-deal-3"));
});

test("consent gate: a new proposal clears prior consents", async () => {
    const depositAddressFor = (id) => `0xDEPOSIT-${id}`;
    const encryptInvoice = () => ({ blob: {}, commitment: "0xcommit", wrappedKeys: {} });
    const router = concordRouterFactory({ depositAddressFor, encryptInvoice });

    await run(router, "post", "/concords", { userId: "merchant-4", body: { concordId: "test-deal-4", merchantLegalName: "Acme" } });
    let concord = await store.get("concords", "test-deal-4");
    concord.parties.client = { id: "client-4", legalName: "Client Co" };
    await store.put("concords", "test-deal-4", concord);

    const terms1 = { description: "v1", totalValue: 100, currency: "USD", milestones: [{ id: "m1", label: "all", percent: 100, dueOn: "signing" }] };
    await run(router, "post", "/concords/:id/propose", { userId: "merchant-4", params: { id: "test-deal-4" }, body: { terms: terms1 } });
    await run(router, "post", "/concords/:id/accept", { userId: "merchant-4", params: { id: "test-deal-4" }, body: { version: 1 } });
    await run(router, "post", "/concords/:id/consent", { userId: "merchant-4", params: { id: "test-deal-4" }, body: { version: 1, confirmed: true } });

    // Client counters with a new version.
    const terms2 = { description: "v2", totalValue: 200, currency: "USD", milestones: [{ id: "m1", label: "all", percent: 100, dueOn: "signing" }] };
    await run(router, "post", "/concords/:id/propose", { userId: "client-4", params: { id: "test-deal-4" }, body: { terms: terms2, diffFrom: 1 } });

    concord = await store.get("concords", "test-deal-4");
    const v1 = concord.termsVersions.find(v => v.version === 1);
    assert.deepStrictEqual(v1.consents, {}, "merchant's consent to v1 must not silently apply to v2");
});

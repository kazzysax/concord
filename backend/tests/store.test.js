// store.test.js
// Run with: node --test tests/
// Covers the memory driver only - postgres driver needs a real DB and is
// better covered by an integration test against docker-compose's db service.

const { test } = require("node:test");
const assert = require("node:assert");

test("store: put then get returns the same value", async () => {
    process.env.STORE_DRIVER = "memory";
    delete require.cache[require.resolve("../store")];
    const store = require("../store");
    await store.put("concords", "deal-1", { concordId: "deal-1", status: "negotiating" });
    const got = await store.get("concords", "deal-1");
    assert.strictEqual(got.status, "negotiating");
});

test("store: get on missing key returns null, not throw", async () => {
    delete require.cache[require.resolve("../store")];
    const store = require("../store");
    const got = await store.get("concords", "does-not-exist");
    assert.strictEqual(got, null);
});

test("store: checkpoint round-trips", async () => {
    delete require.cache[require.resolve("../store")];
    const store = require("../store");
    await store.setCheckpoint("base-sepolia", 12345);
    const cp = await store.getCheckpoint("base-sepolia");
    assert.strictEqual(cp, 12345);
});

test("store: appendMessage preserves order", async () => {
    delete require.cache[require.resolve("../store")];
    const store = require("../store");
    await store.appendMessage("deal-1", { id: 1, text: "first" });
    await store.appendMessage("deal-1", { id: 2, text: "second" });
    const msgs = await store.getMessages("deal-1");
    assert.strictEqual(msgs.length, 2);
    assert.strictEqual(msgs[0].text, "first");
    assert.strictEqual(msgs[1].text, "second");
});

test("store: putIfAbsent only writes once", async () => {
    delete require.cache[require.resolve("../store")];
    const store = require("../store");
    assert.strictEqual(await store.putIfAbsent("commitments", "once", { ok: 1 }), true);
    assert.strictEqual(await store.putIfAbsent("commitments", "once", { ok: 2 }), false);
    assert.deepStrictEqual(await store.get("commitments", "once"), { ok: 1 });
});

test("store: claimConcordFreeze is atomic in memory driver", async () => {
    delete require.cache[require.resolve("../store")];
    const store = require("../store");
    await store.put("concords", "deal-freeze", { concordId: "deal-freeze", parties: { merchant: { id: "m" }, client: { id: "c" } }, history: [], frozenContract: null });
    const first = await store.claimConcordFreeze("deal-freeze", { pending: true });
    const second = await store.claimConcordFreeze("deal-freeze", { pending: true });
    assert.ok(first);
    assert.strictEqual(second, null);
});

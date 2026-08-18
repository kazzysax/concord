const { test } = require("node:test");
const assert = require("node:assert");
const { validate, rateLimit, ID_PATTERN } = require("../middleware");

function mockRes() {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = () => {};
    return res;
}

test("validate: rejects missing required field", () => {
    const mw = validate({ name: { type: "string", required: true } });
    const res = mockRes();
    let nextCalled = false;
    mw({ body: {} }, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
});

test("validate: rejects unexpected fields", () => {
    const mw = validate({ name: { type: "string" } });
    const res = mockRes();
    let nextCalled = false;
    mw({ body: { name: "ok", extra: "not allowed" } }, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.ok(res.body.details.some(d => d.includes("extra")));
});

test("validate: passes clean input through", () => {
    const mw = validate({ name: { type: "string", required: true, maxLength: 10 } });
    const res = mockRes();
    let nextCalled = false;
    mw({ body: { name: "ok" } }, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
});

test("ID_PATTERN: accepts typical deal IDs", () => {
    assert.ok(ID_PATTERN.test("DEAL-2026-0088"));
    assert.ok(ID_PATTERN.test("m1"));
});

test("ID_PATTERN: rejects path traversal attempts", () => {
    assert.ok(!ID_PATTERN.test("../../etc/passwd"));
    assert.ok(!ID_PATTERN.test("deal with spaces"));
});

test("rateLimit: allows requests under the cap", () => {
    const mw = rateLimit({ windowMs: 60_000, max: 3, keyFn: () => "test-key" });
    const res = mockRes();
    let calls = 0;
    for (let i = 0; i < 3; i++) mw({ userId: "u1", ip: "1.1.1.1" }, res, () => { calls++; });
    assert.strictEqual(calls, 3);
    assert.strictEqual(res.statusCode, 200);
});

test("rateLimit: blocks requests over the cap", () => {
    const mw = rateLimit({ windowMs: 60_000, max: 2, keyFn: () => "test-key-2" });
    const res = mockRes();
    let calls = 0;
    for (let i = 0; i < 4; i++) mw({ userId: "u1", ip: "1.1.1.1" }, res, () => { calls++; });
    assert.strictEqual(calls, 2);
    assert.strictEqual(res.statusCode, 429);
});

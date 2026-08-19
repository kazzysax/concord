const crypto = require("crypto");
const { PrivyClient } = require("@privy-io/server-auth");

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required. Concord no longer ships with backend auth mocks.");
}

const privyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

async function verify(token) {
    if (!token) return null;

    try {
        const claims = await privyClient.verifyAuthToken(token);
        const user = await privyClient.getUser(claims.userId);
        const wallet = user.linkedAccounts?.find(account => account.type === "wallet")?.address
            || user.wallet?.address
            || null;
        return { userId: claims.userId, wallet };
    } catch {
        return null;
    }
}

function bearer(req) {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : null;
}

async function requireAuth(req, res, next) {
    const identity = await verify(bearer(req));
    if (!identity) return res.status(401).json({ error: "unauthenticated" });
    req.userId = identity.userId;
    req.wallet = identity.wallet;
    next();
}

async function optionalAuth(req, res, next) {
    const identity = await verify(bearer(req));
    req.userId = identity?.userId || null;
    req.wallet = identity?.wallet || null;
    next();
}

function requireIndexer(req, res, next) {
    const expected = process.env.INDEXER_SECRET;
    if (!expected) return res.status(500).json({ error: "INDEXER_SECRET not configured" });

    const supplied = String(req.headers["x-indexer-secret"] || "");
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    if (expectedBytes.length !== suppliedBytes.length || !crypto.timingSafeEqual(expectedBytes, suppliedBytes)) {
        return res.status(401).json({ error: "bad indexer secret" });
    }
    next();
}

module.exports = { requireAuth, optionalAuth, requireIndexer };

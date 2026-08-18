// auth.js
// Verifies a Privy access token and attaches { userId, wallet } to req.
//
// Two modes:
//   PRIVY_APP_ID + PRIVY_APP_SECRET set  -> real verification via Privy's
//     server SDK. Tokens are cryptographically checked; forged ones fail.
//   Neither set                          -> DEV MODE. Decodes an unsigned
//     token without verifying. Anyone can impersonate anyone. The server
//     refuses to start in dev-mode auth if NODE_ENV=production.

let privyClient = null;
const crypto = require("crypto");
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const DEV_AUTH = !PRIVY_APP_ID || !PRIVY_APP_SECRET;

if (DEV_AUTH) {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Refusing to start: NODE_ENV=production but PRIVY_APP_ID/PRIVY_APP_SECRET are unset. Dev auth is forgeable.");
    }
    console.warn("WARNING: dev auth mode - tokens are NOT verified and can be forged. Set PRIVY_APP_ID and PRIVY_APP_SECRET.");
} else {
    const { PrivyClient } = require("@privy-io/server-auth");
    privyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
}

async function verify(token) {
    if (!token) return null;

    if (DEV_AUTH) {
        try {
            const payload = JSON.parse(Buffer.from(token.split(".")[1] || "", "base64").toString("utf8") || "{}");
            return payload.sub ? { userId: payload.sub, wallet: payload.wallet || null } : null;
        } catch {
            return null;
        }
    }

    try {
        // Verifies signature, expiry, and issuer against your Privy app.
        const claims = await privyClient.verifyAuthToken(token);
        const user = await privyClient.getUser(claims.userId);
        const wallet = user.linkedAccounts?.find(a => a.type === "wallet")?.address
            || user.wallet?.address
            || null;
        return { userId: claims.userId, wallet };
    } catch (err) {
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

// Guards the indexer callback so only the indexer can mark things paid.
function requireIndexer(req, res, next) {
    const expected = process.env.INDEXER_SECRET;
    if (!expected) {
        if (process.env.NODE_ENV === "production") {
            return res.status(500).json({ error: "INDEXER_SECRET not configured" });
        }
        return next();   // dev convenience only
    }
    const supplied = String(req.headers["x-indexer-secret"] || "");
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    if (expectedBytes.length !== suppliedBytes.length || !crypto.timingSafeEqual(expectedBytes, suppliedBytes)) {
        return res.status(401).json({ error: "bad indexer secret" });
    }
    next();
}

module.exports = { requireAuth, optionalAuth, requireIndexer, DEV_AUTH };

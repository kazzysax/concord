// middleware.js
// Rate limiting and input validation. Both were missing entirely - the
// Express routes accepted arbitrary payloads and unlimited request rates.

// Simple in-process token bucket per key. For multi-instance deployments
// swap for a Redis-backed limiter (express-rate-limit + rate-limit-redis);
// per-process limits stop being meaningful once you run more than one node.
function rateLimit({ windowMs = 60_000, max = 60, keyFn } = {}) {
    const buckets = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
    }, windowMs).unref();

    return (req, res, next) => {
        const key = keyFn ? keyFn(req) : (req.userId || req.ip);
        const now = Date.now();
        let b = buckets.get(key);
        if (!b || now > b.resetAt) {
            b = { count: 0, resetAt: now + windowMs };
            buckets.set(key, b);
        }
        b.count++;
        res.setHeader("X-RateLimit-Limit", max);
        res.setHeader("X-RateLimit-Remaining", Math.max(0, max - b.count));
        if (b.count > max) {
            return res.status(429).json({ error: "rate limit exceeded", retryAfterMs: b.resetAt - now });
        }
        next();
    };
}

// Declarative body validation. Rejects unknown fields rather than silently
// storing them, so a client can't smuggle extra keys into a stored document.
function validate(schema) {
    return (req, res, next) => {
        const body = req.body || {};
        const errors = [];

        for (const [field, rule] of Object.entries(schema)) {
            const val = body[field];
            if (val === undefined || val === null || val === "") {
                if (rule.required) errors.push(`${field} is required`);
                continue;
            }
            if (rule.type === "string" && typeof val !== "string") errors.push(`${field} must be a string`);
            if (rule.type === "number" && typeof val !== "number") errors.push(`${field} must be a number`);
            if (rule.type === "boolean" && typeof val !== "boolean") errors.push(`${field} must be a boolean`);
            if (rule.type === "object" && (typeof val !== "object" || Array.isArray(val))) errors.push(`${field} must be an object`);
            if (rule.type === "array" && !Array.isArray(val)) errors.push(`${field} must be an array`);
            if (rule.maxLength && typeof val === "string" && val.length > rule.maxLength) {
                errors.push(`${field} exceeds ${rule.maxLength} characters`);
            }
            if (rule.pattern && typeof val === "string" && !rule.pattern.test(val)) {
                errors.push(`${field} has invalid format`);
            }
            if (rule.min !== undefined && typeof val === "number" && val < rule.min) errors.push(`${field} below minimum`);
            if (rule.max !== undefined && typeof val === "number" && val > rule.max) errors.push(`${field} above maximum`);
        }

        const unknown = Object.keys(body).filter(k => !schema[k]);
        if (unknown.length) errors.push(`unexpected fields: ${unknown.join(", ")}`);

        if (errors.length) return res.status(400).json({ error: "validation failed", details: errors });
        next();
    };
}

// IDs end up in URLs, storage keys, and keccak256 preimages - keep them
// boring so none of those layers has to escape anything.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function securityHeaders(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (process.env.NODE_ENV === "production") {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
}

module.exports = { rateLimit, validate, ID_PATTERN, securityHeaders };

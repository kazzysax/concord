// chat.js
// Freeform discussion per concord, persisted through store.js's dedicated
// message methods (append-only, ordered by seq) rather than the generic
// key/value table - a thread is a list, not a document that gets replaced.

const { requireAuth } = require("./auth");
const { rateLimit, validate } = require("./middleware");
const store = require("./store");

module.exports = function chatRouter({ getConcord, requireParty }) {
    const express = require("express");
    const router = express.Router();

    router.get("/concords/:id/messages", requireAuth, async (req, res) => {
        const concord = await getConcord(req.params.id);
        if (!concord) return res.status(404).json({ error: "not found" });
        if (!requireParty(concord, req.userId)) return res.status(403).json({ error: "not a party" });
        res.json(await store.getMessages(req.params.id));
    });

    router.post("/concords/:id/messages", requireAuth,
        rateLimit({ windowMs: 10_000, max: 20 }),   // chat spam guard, separate from the global limiter
        validate({ text: { type: "string", required: true, maxLength: 2000 } }),
        async (req, res) => {
            const concord = await getConcord(req.params.id);
            if (!concord) return res.status(404).json({ error: "not found" });
            if (!requireParty(concord, req.userId)) return res.status(403).json({ error: "not a party" });

            const text = req.body.text.trim();
            if (!text) return res.status(400).json({ error: "message cannot be empty" });
            const msg = await store.appendMessage(req.params.id, {
                from: req.userId, text, at: new Date().toISOString()
            });
            res.json(msg);
        });

    // draft.js reads the thread through this, kept async to match store's
    // interface even though the memory driver could technically be sync.
    router.getThread = (concordId) => store.getMessages(concordId);

    return router;
};

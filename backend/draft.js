// draft.js
// Turns a chat thread into a structured terms object matching the shape
// concord.js's /propose already accepts. Never auto-submits - returns a
// draft for the calling party to review, edit, and send themselves through
// the normal propose flow. This is the only place an LLM touches the app;
// nothing here writes to concords, terms, or the chain.
//
// Requires ANTHROPIC_API_KEY. Uses the Messages API directly via fetch so
// no extra dependency is needed beyond what's already in package.json.

const { requireAuth } = require("./auth");

const SYSTEM_PROMPT = `You draft structured contract terms from a negotiation chat between a merchant and a client. Given the chat transcript, output ONLY a JSON object with this exact shape, nothing else - no markdown fences, no commentary:

{
  "description": "one line describing the deal",
  "totalValue": <number>,
  "currency": "<3-letter code>",
  "milestones": [{ "id": "m1", "label": "<name>", "percent": <number>, "dueOn": "<'signing' or a description>" }],
  "cancellationTerms": "<plain sentence, or empty string if not discussed>",
  "disputeResolution": "<plain sentence, or empty string if not discussed>",
  "missingFromChat": ["<field names the chat never actually specified, so the sender knows what they're filling in themselves>"]
}

Milestone percents must sum to 100. Only include figures the chat actually specified - if the total value or a percentage was never stated, make a reasonable placeholder AND list that field in missingFromChat. Never invent cancellation or dispute terms if neither party mentioned them - leave them empty and list them in missingFromChat instead.`;

module.exports = function draftRouter({ getThread, getConcord, requireParty }) {
    const express = require("express");
    const router = express.Router();

    router.post("/concords/:id/draft", requireAuth, async (req, res) => {
        const concord = await getConcord(req.params.id);
        if (!concord) return res.status(404).json({ error: "not found" });
        if (!requireParty(concord, req.userId)) return res.status(403).json({ error: "not a party" });

        const messages = await getThread(req.params.id);
        if (!messages || messages.length === 0) {
            return res.status(400).json({ error: "no chat history yet - talk it through first" });
        }

        const transcript = messages.slice(-200).map(m => `${m.from}: ${m.text}`).join("\n").slice(-50_000);

        if (!process.env.ANTHROPIC_API_KEY) {
            return res.status(503).json({ error: "ANTHROPIC_API_KEY not set - drafting unavailable, fill terms in manually" });
        }

        try {
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                signal: AbortSignal.timeout(30_000),
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": process.env.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify({
                    model: "claude-sonnet-4-6",
                    max_tokens: 1000,
                    system: SYSTEM_PROMPT,
                    messages: [{ role: "user", content: `Chat transcript:\n${transcript}` }]
                })
            });

            if (!response.ok) throw new Error(`provider returned HTTP ${response.status}`);
            const data = await response.json();
            const raw = data.content?.find(b => b.type === "text")?.text || "";
            const cleaned = raw.replace(/```json|```/g, "").trim();
            const draft = JSON.parse(cleaned);
            if (!draft || typeof draft.description !== "string" || !Number.isFinite(Number(draft.totalValue))
                || typeof draft.currency !== "string" || !Array.isArray(draft.milestones)
                || draft.milestones.length === 0) {
                throw new Error("provider returned an invalid terms object");
            }
            const percentTotal = draft.milestones.reduce((sum, m) => sum + Number(m.percent || 0), 0);
            if (!Number.isFinite(percentTotal) || Math.abs(percentTotal - 100) > 0.01) {
                throw new Error("provider returned milestone percentages that do not total 100");
            }

            res.json({ draft, source: "chat", basedOnMessages: messages.length });
        } catch (err) {
            res.status(502).json({ error: "drafting failed", detail: err.message });
        }
    });

    return router;
};

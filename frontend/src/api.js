// api.js
export function makeApi(getAccessToken) {
  const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

  async function call(path, opts = {}) {
    const token = await getAccessToken();
    const res = await fetch(`${apiBase}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {})
      }
    });
    return res.json();
  }

  return {
    listConcords: () => call("/concords"),
    createConcord: (concordId, merchantLegalName) =>
      call("/concords", { method: "POST", body: JSON.stringify({ concordId, merchantLegalName }) }),
    resolve: (concordId, token) =>
      call(`/concords/${encodeURIComponent(concordId)}/resolve${token ? `?token=${token}` : ""}`),
    getConcord: (concordId) => call(`/concords/${encodeURIComponent(concordId)}`),
    propose: (concordId, terms, diffFrom, changes) =>
      call(`/concords/${encodeURIComponent(concordId)}/propose`, { method: "POST", body: JSON.stringify({ terms, diffFrom, changes }) }),
    accept: (concordId, version, signature) =>
      call(`/concords/${encodeURIComponent(concordId)}/accept`, { method: "POST", body: JSON.stringify({ version, signature }) }),
    freeze: (concordId) =>
      call(`/concords/${encodeURIComponent(concordId)}/freeze`, { method: "POST" }),
    getMessages: (concordId) =>
      call(`/concords/${encodeURIComponent(concordId)}/messages`),
    postMessage: (concordId, text) =>
      call(`/concords/${encodeURIComponent(concordId)}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
    draft: (concordId) =>
      call(`/concords/${encodeURIComponent(concordId)}/draft`, { method: "POST" }),
    consent: (concordId, version, confirmed) =>
      call(`/concords/${encodeURIComponent(concordId)}/consent`, { method: "POST", body: JSON.stringify({ version, confirmed }) }),
    withdrawConsent: (concordId, version) =>
      call(`/concords/${encodeURIComponent(concordId)}/withdraw-consent`, { method: "POST", body: JSON.stringify({ version }) }),
    proposeSubcontract: (concordId, terms) =>
      call(`/concords/${encodeURIComponent(concordId)}/subcontract`, { method: "POST", body: JSON.stringify({ terms }) }),
    consentSubcontract: (concordId, subId, confirmed) =>
      call(`/concords/${encodeURIComponent(concordId)}/subcontract/${encodeURIComponent(subId)}/consent`, { method: "POST", body: JSON.stringify({ confirmed }) }),
    sweepMilestone: (concordId, milestoneId, chain) =>
      call(`/concords/${encodeURIComponent(concordId)}/milestones/${encodeURIComponent(milestoneId)}/sweep`, { method: "POST", body: JSON.stringify({ chain }) })
  };
}

import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext.jsx";
import { makeApi } from "./api.js";
import { card, label, btn, btnPrimary, input, badge } from "./ui.js";
import { app, font, headline } from "./theme.js";

export default function ConferenceRoom({ concordId, onFrozen }) {
  const { user, getAccessToken, signMessage } = useAuth();
  const api = makeApi(getAccessToken);

  const [concord, setConcord] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [form, setForm] = useState({ description: "", totalValue: "", currency: "EUR", milestonePercent: 50, cancellationTerms: "" });
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    api.getConcord(concordId).then(setConcord);
    return api.getMessages(concordId).then(setMessages).finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [concordId]);

  const sendChat = async () => {
    if (!chatText.trim()) return;
    await api.postMessage(concordId, chatText);
    setChatText("");
    refresh();
  };

  const draftFromChat = async () => {
    setDrafting(true);
    const res = await api.draft(concordId);
    setDrafting(false);
    if (res.draft) {
      setForm({
        description: res.draft.description || "",
        totalValue: res.draft.totalValue || "",
        currency: res.draft.currency || "EUR",
        milestonePercent: res.draft.milestones?.[0]?.percent ?? 50,
        cancellationTerms: res.draft.cancellationTerms || ""
      });
      if (res.draft.missingFromChat?.length) {
        alert(`Drafted from chat. Still needs: ${res.draft.missingFromChat.join(", ")}`);
      }
    } else if (res.error) {
      alert(res.error);
    }
  };


  const role = concord && user ? (user.id === concord.parties.merchant.id ? "merchant" : "client") : null;
  const latest = concord?.termsVersions[concord.termsVersions.length - 1];
  const bothIds = concord ? [concord.parties.merchant.id, concord.parties.client?.id].filter(Boolean) : [];
  const iAccepted = latest && user && latest.acceptedBy.includes(user.id);
  const readyToFreeze = latest && bothIds.length === 2 && bothIds.every(id => latest.acceptedBy.includes(id));
  const allConsented = latest && bothIds.length === 2 && bothIds.every(id => latest.consents?.[id]?.confirmed);

  const submitOffer = async () => {
    const terms = {
      description: form.description,
      totalValue: parseFloat(form.totalValue),
      currency: form.currency,
      milestones: [
        { id: "m1", label: "Deposit", percent: Number(form.milestonePercent), dueOn: "signing" },
        { id: "m2", label: "Balance", percent: 100 - Number(form.milestonePercent), dueOn: "on delivery" }
      ],
      cancellationTerms: form.cancellationTerms
    };
    await api.propose(concordId, terms);
    await refresh();
    setForm({ ...form, description: "", totalValue: "" });
  };

  const acceptLatest = async () => {
    // Real e-sign: hash the terms exactly as concord.js's /accept route
    // recomputes it, sign that hash with the actual wallet, send the
    // signature. The backend recovers the signer and checks it matches the
    // authenticated wallet - this only succeeds with a genuine signature.
    const { ethers } = await import("ethers");
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(latest.terms)));
    const { signature } = await signMessage(termsHash);
    const res = await api.accept(concordId, latest.version, signature);
    await refresh();
  };

  const doFreeze = async () => {
    const res = await api.freeze(concordId);
    if (res.contractId) onFrozen(res);
  };

  if (loading) return <p style={label}>Loading room…</p>;
  if (!concord) return <p style={label}>Concord not found.</p>;

  return (
    <div style={{ fontFamily: font.sans, color: app.text, paddingTop: 24 }}>
      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 500 }}>{concord.parties.merchant.legalName} ↔ {concord.parties.client?.legalName || "waiting for client to join"}</p>
          <p style={{ ...label, margin: "4px 0 0" }}>You're viewing as {role || "observer"}</p>
        </div>
        <span style={badge(concord.status)}>{concord.status}</span>
      </div>

      <div style={card}>
        <p style={{ margin: "0 0 8px", fontWeight: 500, fontSize: 14 }}>Chat</p>
        <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 10 }}>
          {messages.length === 0 && <p style={{ ...label, margin: 0 }}>Talk through what you both want before drafting terms.</p>}
          {messages.map(m => (
            <div key={m.id} style={{ marginBottom: 8, textAlign: m.from === user?.id ? "right" : "left" }}>
              <span style={{ display: "inline-block", background: m.from === user?.id ? app.accent : app.surfaceRaised, color: m.from === user?.id ? app.bg : app.text, borderRadius: 12, padding: "7px 12px", fontSize: 13, maxWidth: "80%", lineHeight: 1.5 }}>
                {m.text}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={input} value={chatText} onChange={e => setChatText(e.target.value)} placeholder="Type a message" onKeyDown={e => e.key === "Enter" && sendChat()} />
          <button style={btn} onClick={sendChat}>Send</button>
        </div>
        {role && !concord.frozenContract && (
          <button style={{ ...btn, marginTop: 8, width: "100%" }} onClick={draftFromChat} disabled={drafting}>
            {drafting ? "Drafting…" : "Draft terms from this chat"}
          </button>
        )}
      </div>


      {concord.termsVersions.length === 0 && (
        <div style={{ ...card, textAlign: "center", color: "#6b6a63" }}>
          No terms proposed yet. {role === "merchant" ? "Send the first offer below." : "Waiting on the merchant's first offer."}
        </div>
      )}

      {concord.termsVersions.map(v => (
        <div key={v.version} style={{ ...card, borderLeft: v.version === latest.version ? `3px solid ${app.accent}` : `1px solid ${app.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontWeight: 500, fontSize: 13, color: app.text }}>
              Version {v.version} — proposed by {v.proposedBy === concord.parties.merchant.id ? "merchant" : "client"}
            </p>
            <span style={{ fontSize: 12, color: app.textFaint }}>{new Date(v.at).toLocaleString()}</span>
          </div>
          <p style={{ margin: "8px 0 4px" }}>{v.terms.description}</p>
          <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{v.terms.totalValue} {v.terms.currency}</p>
          <p style={{ ...label, margin: "0 0 4px" }}>
            {v.terms.milestones.map(m => `${m.label} ${m.percent}%`).join(" · ")}
          </p>
          {v.terms.cancellationTerms && <p style={{ ...label, margin: 0 }}>Cancellation: {v.terms.cancellationTerms}</p>}
          <p style={{ fontSize: 12, color: app.accent, margin: "8px 0 0" }}>
            Accepted by: {v.acceptedBy.map(id => id === concord.parties.merchant.id ? "merchant" : "client").join(", ")}
          </p>
        </div>
      ))}

      {latest && role && !iAccepted && (
        <button style={{ ...btnPrimary, marginBottom: 12 }} onClick={acceptLatest}>Accept version {latest.version}</button>
      )}

      {readyToFreeze && (
        <div style={{ ...card, background: app.surfaceRaised, borderColor: app.borderStrong }}>
          <p style={{ margin: "0 0 10px", fontWeight: 500 }}>Both parties accepted version {latest.version}.</p>
          <p style={{ ...label, margin: "0 0 12px", lineHeight: 1.5 }}>
            Before this is recorded on-chain, both parties must confirm there are no
            further changes. Once frozen, the terms cannot be edited — only extended
            by a subcontract that you both consent to.
          </p>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!latest.consents?.[user?.id]?.confirmed}
              onChange={async (e) => {
                if (e.target.checked) await api.consent(concordId, latest.version, true);
                else await api.withdrawConsent(concordId, latest.version);
                refresh();
              }}
              style={{ marginTop: 2 }}
            />
            <span>I have read the full contract and agree to all its contents. I want no further changes.</span>
          </label>

          <div style={{ fontSize: 12, color: app.textMuted, marginBottom: 12 }}>
            {bothIds.map(id => (
              <div key={id}>
                {id === concord.parties.merchant.id ? "Merchant" : "Client"}:{" "}
                {latest.consents?.[id]?.confirmed
                  ? <span style={{ color: app.accent }}>consented</span>
                  : <span style={{ color: "#E3B341" }}>awaiting consent</span>}
              </div>
            ))}
          </div>

          {allConsented ? (
            <button style={btnPrimary} onClick={doFreeze}>Sign and record on-chain</button>
          ) : (
            <p style={{ ...label, margin: 0, fontStyle: "italic" }}>Waiting for both parties to consent.</p>
          )}
        </div>
      )}

      {role && !concord.frozenContract && (
        <div style={card}>
          <p style={{ margin: "0 0 8px", fontWeight: 500 }}>{concord.termsVersions.length === 0 ? "Propose terms" : "Send a counter-offer"}</p>
          <div style={{ marginBottom: 8 }}>
            <p style={{ ...label, margin: "0 0 4px" }}>Description</p>
            <input style={input} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <p style={{ ...label, margin: "0 0 4px" }}>Total value</p>
              <input style={input} type="number" value={form.totalValue} onChange={e => setForm({ ...form, totalValue: e.target.value })} />
            </div>
            <div>
              <p style={{ ...label, margin: "0 0 4px" }}>Deposit %</p>
              <input style={input} type="number" value={form.milestonePercent} onChange={e => setForm({ ...form, milestonePercent: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <p style={{ ...label, margin: "0 0 4px" }}>Cancellation terms</p>
            <input style={input} value={form.cancellationTerms} onChange={e => setForm({ ...form, cancellationTerms: e.target.value })} />
          </div>
          <button style={btn} onClick={submitOffer}>Send</button>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { makeApi } from "./api.js";
import { card, label, btn, badge } from "./ui.js";
import { app, font, headline } from "./theme.js";
import InvoiceDocument from "./InvoiceDocument.jsx";

export default function TrackPage({ concordId }) {
  const { getAccessToken } = useAuth();
  const api = makeApi(getAccessToken);
  const [concord, setConcord] = useState(null);
  const [openInvoice, setOpenInvoice] = useState(null);
  const [chainByMilestone, setChainByMilestone] = useState({});
  const [busyMilestone, setBusyMilestone] = useState(null);
  const [notice, setNotice] = useState("");

  const refresh = () => api.getConcord(concordId).then(setConcord);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [concordId]);

  if (!concord) return <p style={{ ...label, paddingTop: 32 }}>Loading...</p>;
  const frozen = concord.frozenContract;
  if (!frozen) return <p style={{ ...label, paddingTop: 32 }}>No contract frozen yet.</p>;

  if (openInvoice) {
    const m = frozen.milestoneInvoices.find(x => x.milestoneId === openInvoice);
    return (
      <div style={{ paddingTop: 24, fontFamily: font.sans }}>
        <button style={{ ...btn, marginBottom: 20 }} onClick={() => setOpenInvoice(null)}>Back to tracker</button>
        <InvoiceDocument milestone={m} contract={frozen} parties={concord.parties} />
      </div>
    );
  }

  const paidCount = frozen.milestoneInvoices.filter(m => m.status === "paid" || m.status === "settled").length;
  const pct = (paidCount / frozen.milestoneInvoices.length) * 100;

  return (
    <div style={{ fontFamily: font.sans, color: app.text, paddingTop: 24 }}>
      <div style={card}>
        <p style={{ ...headline, fontSize: 20, margin: "0 0 4px" }}>{frozen.contractId}</p>
        <p style={{ ...label, margin: "0 0 16px" }}>{paidCount} of {frozen.milestoneInvoices.length} milestones settled</p>
        <div style={{ height: 6, background: app.bg, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: app.accent, transition: "width 0.4s" }} />
        </div>
      </div>

      {frozen.milestoneInvoices.map(m => (
        <div key={m.milestoneId} style={{ ...card, cursor: "pointer" }} onClick={() => setOpenInvoice(m.milestoneId)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>{m.label}</p>
            <span style={badge(m.status)}>{m.status}</span>
          </div>
          <table style={{ width: "100%", fontSize: 13 }}>
            <tbody>
              <tr><td style={{ color: app.textMuted, padding: "3px 0" }}>Amount due</td><td style={{ textAlign: "right" }}>{m.amountDue?.toFixed(2)} {m.currency}</td></tr>
              <tr><td style={{ color: app.textMuted, padding: "3px 0" }}>Deposit address</td><td style={{ textAlign: "right", fontFamily: font.mono, fontSize: 11 }}>{m.depositAddress}</td></tr>
              {m.commitmentOnChain?.registered && (
                <tr><td style={{ color: app.textMuted, padding: "3px 0" }}>Commitment</td><td style={{ textAlign: "right", fontSize: 11, color: app.accent }}>recorded on-chain</td></tr>
              )}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }} onClick={e => e.stopPropagation()}>
            <select
              value={chainByMilestone[m.milestoneId] || "base-sepolia"}
              onChange={e => setChainByMilestone(prev => ({ ...prev, [m.milestoneId]: e.target.value }))}
              style={{ flex: 1, background: app.bg, color: app.text, border: `1px solid ${app.border}`, borderRadius: 9, padding: "10px 12px" }}
            >
              <option value="base-sepolia">Base Sepolia</option>
              <option value="arbitrum-sepolia">Arbitrum Sepolia</option>
            </select>
            <button
              style={btn}
              disabled={busyMilestone === m.milestoneId}
              onClick={async () => {
                setBusyMilestone(m.milestoneId);
                const res = await api.sweepMilestone(concordId, m.milestoneId, chainByMilestone[m.milestoneId] || "base-sepolia");
                setBusyMilestone(null);
                setNotice(res.error || (res.submitted ? "Sweep submitted. The indexer will update this milestone after confirmation." : ""));
                refresh();
              }}
            >
              {busyMilestone === m.milestoneId ? "Sweeping..." : "Check payment"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: app.textFaint, margin: "10px 0 0" }}>Open invoice -></p>
        </div>
      ))}

      {notice && <p style={{ ...label, paddingTop: 8 }}>{notice}</p>}

      <Subcontracts concord={concord} api={api} concordId={concordId} onChange={refresh} />
    </div>
  );
}

function Subcontracts({ concord, api, concordId, onChange }) {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const subs = concord.subcontracts || [];
  const bothIds = [concord.parties.merchant.id, concord.parties.client?.id].filter(Boolean);

  const propose = async () => {
    if (!text.trim()) return;
    await api.proposeSubcontract(concordId, { description: text.trim() });
    setText("");
    setShowForm(false);
    onChange();
  };

  return (
    <div style={{ ...card, marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: subs.length ? 14 : 0 }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>Subcontracts</p>
        <button style={btn} onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "Propose"}</button>
      </div>

      {showForm && (
        <div style={{ marginTop: 14 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Describe the addendum: extra scope, revised deadline, additional milestone..."
            style={{ width: "100%", minHeight: 80, background: app.bg, border: `1px solid ${app.border}`, borderRadius: 9, padding: 12, fontSize: 13, color: app.text, fontFamily: font.sans, boxSizing: "border-box", outline: "none" }}
          />
          <p style={{ ...label, margin: "8px 0 10px", fontSize: 12 }}>
            The other party must consent before this is recorded on-chain.
          </p>
          <button style={btn} onClick={propose}>Propose subcontract</button>
        </div>
      )}

      {subs.map(s => {
        const iConsented = s.consents?.[user?.id]?.confirmed;
        return (
          <div key={s.subcontractId} style={{ borderTop: `1px solid ${app.border}`, paddingTop: 14, marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 13, fontFamily: font.mono }}>{s.subcontractId}</p>
              <span style={badge(s.frozen ? "agreed" : "pending")}>{s.frozen ? "on-chain" : "awaiting consent"}</span>
            </div>
            <p style={{ fontSize: 13, margin: "0 0 10px", lineHeight: 1.6 }}>{s.terms?.description}</p>
            <div style={{ fontSize: 12, color: app.textMuted, marginBottom: 10 }}>
              {bothIds.map(id => (
                <div key={id}>
                  {id === concord.parties.merchant.id ? "Merchant" : "Client"}:{" "}
                  {s.consents?.[id]?.confirmed
                    ? <span style={{ color: app.accent }}>consented</span>
                    : <span style={{ color: "#E3B341" }}>awaiting</span>}
                </div>
              ))}
            </div>
            {!s.frozen && !iConsented && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" onChange={async e => { if (e.target.checked) { await api.consentSubcontract(concordId, s.subcontractId, true); onChange(); } }} style={{ marginTop: 2 }} />
                <span>I agree to this addendum and want no further changes.</span>
              </label>
            )}
            {s.frozen && (
              <p style={{ fontSize: 11, fontFamily: font.mono, color: app.textFaint, margin: 0, wordBreak: "break-all" }}>{s.commitment}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

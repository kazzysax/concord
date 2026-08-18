import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext.jsx";
import { makeApi } from "./api.js";
import { card, label, btn, btnPrimary, input, badge } from "./ui.js";
import { app, font, headline, headlineAccent } from "./theme.js";

export default function App() {
  const { user, logout, getAccessToken } = useAuth();
  const api = makeApi(getAccessToken);
  const [view, setView] = useState("list");
  const [created, setCreated] = useState(null);

  return (
    <div style={{ fontFamily: font.sans, color: app.text }}>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 0", marginBottom: 32, borderBottom: `1px solid ${app.border}` }}>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Concord</span>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: app.textMuted, fontFamily: font.mono }}>{user?.wallet?.slice(0, 6)}…{user?.wallet?.slice(-4)}</span>
          <button style={btn} onClick={logout}>Sign out</button>
        </div>
      </nav>

      {view === "list" && <ConcordList api={api} onNew={() => setView("create")} />}
      {view === "create" && <CreateConcord api={api} onCreated={(res) => { setCreated(res); setView("created"); }} onCancel={() => setView("list")} />}
      {view === "created" && <InviteReady result={created} onDone={() => setView("list")} />}
    </div>
  );
}

function ConcordList({ api, onNew }) {
  const [concords, setConcords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.listConcords().then(r => setConcords(Array.isArray(r) ? r : [])).finally(() => setLoading(false)); }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ ...headline, fontSize: 30, margin: 0 }}>
          Your <span style={{ ...headlineAccent, fontSize: 29 }}>deals</span>
        </h1>
        <button style={btnPrimary} onClick={onNew}>Start a deal →</button>
      </div>

      {loading && <p style={label}>Loading…</p>}

      {!loading && concords.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "3rem 1.5rem" }}>
          <p style={{ margin: "0 0 8px", fontWeight: 500 }}>No deals yet</p>
          <p style={{ ...label, margin: 0, lineHeight: 1.6 }}>
            Start one and send the invite link to the other party. Everything happens in the room from there.
          </p>
        </div>
      )}

      {concords.map(c => (
        <a key={c.concordId} href={`/c/${encodeURIComponent(c.concordId)}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ ...card, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <p style={{ margin: 0, fontWeight: 500, fontSize: 15 }}>{c.concordId}</p>
              <span style={badge(c.status)}>{c.status}</span>
            </div>
            <p style={{ ...label, margin: 0 }}>{c.merchant} ↔ {c.client}</p>
            <p style={{ fontSize: 12, color: app.textFaint, margin: "8px 0 0" }}>
              {c.versionCount} term version{c.versionCount === 1 ? "" : "s"}
              {c.contractId ? ` · deed ${c.contractId}` : ""}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

function CreateConcord({ api, onCreated, onCancel }) {
  const [form, setForm] = useState({
    concordId: "DEAL-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000),
    merchantLegalName: ""
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const res = await api.createConcord(form.concordId, form.merchantLegalName);
    setSubmitting(false);
    if (res.concordId) onCreated(res);
    else alert(res.error || "Could not create deal");
  };

  return (
    <div>
      <h1 style={{ ...headline, fontSize: 30, margin: "0 0 8px" }}>Start a deal</h1>
      <p style={{ ...label, margin: "0 0 24px", lineHeight: 1.6, maxWidth: 460 }}>
        You'll get a link to send the other party. Terms get worked out together in the room — nothing is set here.
      </p>
      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <p style={{ ...label, margin: "0 0 6px" }}>Deal reference</p>
          <input style={input} value={form.concordId} onChange={e => setForm({ ...form, concordId: e.target.value })} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <p style={{ ...label, margin: "0 0 6px" }}>Your legal name</p>
          <input style={input} placeholder="Northgate Supply Ltd" value={form.merchantLegalName} onChange={e => setForm({ ...form, merchantLegalName: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnPrimary} onClick={submit} disabled={submitting}>{submitting ? "Creating…" : "Create and get link"}</button>
          <button style={btn} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function InviteReady({ result, onDone }) {
  const url = `${window.location.origin}${result?.inviteLink || ""}`;
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <h1 style={{ ...headline, fontSize: 30, margin: "0 0 8px" }}>Deal created</h1>
      <p style={{ ...label, margin: "0 0 24px", lineHeight: 1.6, maxWidth: 480 }}>
        Send this link to the other party. It stays valid for the whole life of the deal —
        the same URL takes each of you to wherever things currently stand.
      </p>
      <div style={card}>
        <p style={{ fontFamily: font.mono, fontSize: 12, background: app.bg, padding: 12, borderRadius: 8, wordBreak: "break-all", margin: "0 0 14px", color: app.accent }}>{url}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnPrimary} onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); }}>
            {copied ? "Copied" : "Copy link"}
          </button>
          <a href={result?.inviteLink} style={{ textDecoration: "none" }}><button style={btn}>Open room</button></a>
          <button style={btn} onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  );
}

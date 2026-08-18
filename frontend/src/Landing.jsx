import React from "react";
import { app, font, headline, headlineAccent, pill, pillGhost } from "./theme.js";

const HERO_IMAGE = "/hero.jpg";

export default function Landing({ onGetStarted }) {
  return (
    <div style={{ fontFamily: font.sans, color: app.text }}>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 0", marginBottom: 24 }}>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Concord</span>
        <div style={{ display: "flex", gap: 28, fontSize: 13, color: app.textMuted }}>
          <span>The problem</span>
          <span>How it works</span>
          <span>Security</span>
        </div>
      </nav>

      <div style={{
        position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 88, minHeight: 440,
        backgroundImage: `url(${HERO_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center 35%",
        backgroundColor: app.surface
      }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,38,34,0.45) 0%, rgba(10,38,34,0.82) 55%, rgba(10,38,34,0.97) 100%)" }} />
        <div style={{ position: "relative", padding: "3rem 2.75rem 2.75rem", display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: 440, boxSizing: "border-box" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.14em", color: app.accent, margin: "0 0 18px", textTransform: "uppercase" }}>Deal infrastructure</p>
          <h1 style={{ ...headline, fontSize: 50, margin: "0 0 20px", maxWidth: 560 }}>
            <span style={{ ...headlineAccent, fontSize: 48 }}>Agreements</span> you<br />can settle on
          </h1>
          <p style={{ fontSize: 15, color: "rgba(237,242,240,0.78)", maxWidth: 470, lineHeight: 1.65, margin: "0 0 30px" }}>
            From first conversation to signed deed to final payment — one link, one record,
            nothing left to argue about.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button style={pill} onClick={() => onGetStarted("merchant")}>Start a deal →</button>
            <button style={pillGhost} onClick={() => onGetStarted("client")}>I have an invite link</button>
          </div>
        </div>
      </div>

      <Section eyebrow="The problem" title={<>Deals fall apart in the <span style={{ ...headlineAccent, fontSize: 33 }}>gaps</span></>}>
        <p style={{ fontSize: 15, color: app.textMuted, lineHeight: 1.75, maxWidth: 620, margin: "0 0 28px" }}>
          Two businesses meet, agree on something verbally, and then it scatters. Terms live
          in a chat thread. The contract is a template someone half-edited. The invoice arrives
          in an email weeks later with numbers nobody remembers agreeing to. When there's a
          dispute, each side has a different version of the truth and no way to prove theirs.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: app.border, border: `1px solid ${app.border}`, borderRadius: 14, overflow: "hidden" }}>
          <Problem title="Terms get lost" body="What was actually agreed lives across chat, email, and memory." />
          <Problem title="Contracts drift" body="Someone edits a clause after the fact. Nobody can prove the original." />
          <Problem title="Payment is disputed" body="Was it paid? Partially? Late? Each side answers differently." />
        </div>
      </Section>

      <Section eyebrow="The solution" title={<>One record <span style={{ ...headlineAccent, fontSize: 33 }}>both</span> sides trust</>}>
        <p style={{ fontSize: 15, color: app.textMuted, lineHeight: 1.75, maxWidth: 620, margin: "0 0 28px" }}>
          Concord keeps the whole deal in one place, and locks it at the moment both parties
          agree. Terms are drafted from your actual conversation, signed by both wallets, and
          hashed onto a blockchain — so the agreement can be proved but never quietly rewritten.
          Payment status comes from the chain, not from either party's word.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: app.border, border: `1px solid ${app.border}`, borderRadius: 14, overflow: "hidden" }}>
          <Problem title="Tamper-evident" body="A hash of the signed deed is recorded on-chain. Alter it and verification fails." />
          <Problem title="Confidential" body="Only the hash is public. Terms, amounts, and parties stay private to you." />
          <Problem title="Settlement-proven" body="Milestones mark paid only when the chain confirms it. No manual override exists." />
        </div>
      </Section>

      <Section eyebrow="How it works" title={<>Five <span style={{ ...headlineAccent, fontSize: 33 }}>stages</span>, one link</>}>
        <div style={{ border: `1px solid ${app.border}`, borderRadius: 14, overflow: "hidden" }}>
          <Stage n="01" title="Conference room" body="Both parties join through a single invite link and talk it through in plain language. Nothing here is binding." />
          <Stage n="02" title="Draft terms" body="Concord reads the conversation and proposes structured terms — milestones, amounts, cancellation, disputes — flagging anything you never actually settled." border />
          <Stage n="03" title="Consent and sign" body="Both parties confirm there are no further changes, then e-sign the terms with their wallet. Neither signature alone is enough." border />
          <Stage n="04" title="Recorded on-chain" body="The deed freezes. Its hash is written to the blockchain along with one deposit address per milestone." border />
          <Stage n="05" title="Invoice and track" body="Each milestone becomes an invoice with its own address, valid on every supported chain. The tracker updates only when payment is confirmed on-chain." border />
        </div>
      </Section>

      <div style={{ border: `1px solid ${app.border}`, borderRadius: 14, padding: "2.5rem", textAlign: "center", marginBottom: 64 }}>
        <p style={{ ...headline, fontSize: 28, margin: "0 0 12px" }}>
          Start a deal in <span style={{ ...headlineAccent, fontSize: 27 }}>minutes</span>
        </p>
        <p style={{ fontSize: 14, color: app.textMuted, margin: "0 0 24px", maxWidth: 420, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
          Send one link to the other party. Everything else happens in the room.
        </p>
        <button style={pill} onClick={() => onGetStarted("merchant")}>Start a deal →</button>
      </div>
    </div>
  );
}

function Section({ eyebrow, title, children }) {
  return (
    <div style={{ marginBottom: 80 }}>
      <p style={{ fontSize: 11, letterSpacing: "0.14em", color: app.accent, margin: "0 0 14px", textTransform: "uppercase" }}>{eyebrow}</p>
      <h2 style={{ ...headline, fontSize: 34, margin: "0 0 24px" }}>{title}</h2>
      {children}
    </div>
  );
}

function Problem({ title, body }) {
  return (
    <div style={{ background: app.surface, padding: "1.5rem 1.25rem" }}>
      <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 8px", letterSpacing: "-0.01em" }}>{title}</p>
      <p style={{ fontSize: 13, color: app.textMuted, margin: 0, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function Stage({ n, title, body, border }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 20, padding: "1.5rem 1.5rem", borderTop: border ? `1px solid ${app.border}` : "none" }}>
      <p style={{ fontSize: 12, color: app.accent, margin: 0, letterSpacing: "0.1em", paddingTop: 3 }}>{n}</p>
      <div>
        <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 6px", letterSpacing: "-0.01em" }}>{title}</p>
        <p style={{ fontSize: 13.5, color: app.textMuted, margin: 0, lineHeight: 1.65 }}>{body}</p>
      </div>
    </div>
  );
}

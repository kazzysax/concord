import React from "react";
import { paper, font } from "./theme.js";

// Renders a frozen contract as a document, not a screen. Deliberately cream
// paper on a dark app - it should look like something you'd print, file, or
// hand to a lawyer. The signature block is where a wet-ink line would sit on
// a normal deed; here it carries the wallet address and the on-chain hash.
export default function DeedDocument({ contract, parties }) {
  if (!contract) return null;
  const t = contract.terms || {};

  return (
    <div style={{
      background: paper.bg, color: paper.ink, fontFamily: font.sans,
      padding: "3.5rem 3rem", borderRadius: 4, maxWidth: 640, margin: "0 auto"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 48 }}>
        <div>
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{parties?.merchant?.legalName}</p>
          <p style={{ fontSize: 13, margin: 0, color: paper.inkMuted, lineHeight: 1.5 }}>and {parties?.client?.legalName}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>DEED</p>
          <p style={{ fontSize: 13, margin: "4px 0 0", fontFamily: font.mono }}>{contract.contractId}</p>
        </div>
      </div>

      <p style={{ fontSize: 20, fontWeight: 500, margin: "0 0 8px", letterSpacing: "-0.01em" }}>Agreement</p>
      <p style={{ fontSize: 14, lineHeight: 1.75, margin: "0 0 40px", color: paper.ink }}>
        This agreement is entered into between {parties?.merchant?.legalName} and{" "}
        {parties?.client?.legalName} for {t.description}, at a total value of{" "}
        {t.totalValue?.toLocaleString()} {t.currency}, payable in the milestones set out below.
        {t.cancellationTerms ? ` ${t.cancellationTerms}` : ""}
        {t.disputeResolution ? ` ${t.disputeResolution}` : ""}
      </p>

      <p style={{ fontSize: 20, fontWeight: 500, margin: "0 0 16px", letterSpacing: "-0.01em" }}>Milestones</p>
      <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", marginBottom: 12 }}>
        <tbody>
          {(contract.milestoneInvoices || []).map(m => (
            <tr key={m.milestoneId}>
              <td style={{ padding: "10px 0", borderBottom: `1px solid ${paper.rule}` }}>{m.label}</td>
              <td style={{ padding: "10px 0", borderBottom: `1px solid ${paper.rule}`, color: paper.inkMuted, fontSize: 13 }}>{m.dueOn}</td>
              <td style={{ padding: "10px 0", borderBottom: `1px solid ${paper.rule}`, textAlign: "right" }}>
                {m.amountDue?.toFixed(2)} {m.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 48 }}>
        <div style={{ width: 220 }}>
          <Row k="Total" v={`${t.totalValue?.toFixed(2)} ${t.currency}`} bold />
          <Row k="Frozen" v={new Date(contract.frozenAt).toLocaleDateString()} />
        </div>
      </div>

      <p style={{ fontSize: 20, fontWeight: 500, margin: "0 0 20px", letterSpacing: "-0.01em" }}>Signatures</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginBottom: 40 }}>
        <SignatureBlock role="Merchant" party={parties?.merchant} sig={contract.signatures?.[parties?.merchant?.id]} />
        <SignatureBlock role="Client" party={parties?.client} sig={contract.signatures?.[parties?.client?.id]} />
      </div>

      <div style={{ borderTop: `1px solid ${paper.rule}`, paddingTop: 20 }}>
        <p style={{ fontSize: 11, letterSpacing: "0.1em", color: paper.inkMuted, margin: "0 0 8px", textTransform: "uppercase" }}>Recorded on-chain</p>
        <p style={{ fontSize: 12, fontFamily: font.mono, margin: "0 0 4px", wordBreak: "break-all" }}>{contract.commitment}</p>
        <p style={{ fontSize: 12, color: paper.inkMuted, margin: 0 }}>
          {contract.commitmentOnChain?.registered
            ? `Registered on ${contract.commitmentOnChain.results?.map(r => r.chain).join(", ")}`
            : "Not yet registered on-chain"}
        </p>
        <p style={{ fontSize: 11, color: paper.inkMuted, margin: "12px 0 0", lineHeight: 1.6 }}>
          The contents of this deed are not published on-chain. Only the hash above is recorded,
          so any holder of this document can prove it has not been altered since it was signed.
        </p>
      </div>
    </div>
  );
}

function SignatureBlock({ role, party, sig }) {
  return (
    <div>
      <div style={{ borderBottom: `1px solid ${paper.ink}`, paddingBottom: 6, marginBottom: 8, minHeight: 34, display: "flex", alignItems: "flex-end" }}>
        <span style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 19 }}>
          {sig ? party?.legalName : ""}
        </span>
      </div>
      <p style={{ fontSize: 11, letterSpacing: "0.08em", color: paper.inkMuted, margin: "0 0 4px", textTransform: "uppercase" }}>{role}</p>
      {sig ? (
        <>
          <p style={{ fontSize: 11, fontFamily: font.mono, margin: "0 0 2px", wordBreak: "break-all" }}>{sig.wallet}</p>
          <p style={{ fontSize: 11, color: paper.inkMuted, margin: 0 }}>
            {sig.verified ? "Signature verified" : "Unverified"} · {new Date(sig.at).toLocaleDateString()}
          </p>
        </>
      ) : (
        <p style={{ fontSize: 11, color: paper.inkMuted, margin: 0 }}>Awaiting signature</p>
      )}
    </div>
  );
}

function Row({ k, v, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0" }}>
      <span style={{ color: paper.inkMuted }}>{k}</span>
      <span style={{ fontWeight: bold ? 600 : 400 }}>{v}</span>
    </div>
  );
}

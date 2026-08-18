import React from "react";
import { paper, font } from "./theme.js";

// Same paper treatment as the deed. The layout deliberately mirrors a
// conventional invoice - the one substitution is that "bank details" becomes
// the deposit address and chain, since that's the equivalent field here.
export default function InvoiceDocument({ milestone, contract, parties }) {
  if (!milestone) return null;

  return (
    <div style={{
      background: paper.bg, color: paper.ink, fontFamily: font.sans,
      padding: "3.5rem 3rem", borderRadius: 4, maxWidth: 640, margin: "0 auto"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 44 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{parties?.merchant?.legalName}</p>
          <p style={{ fontSize: 13, color: paper.inkMuted, margin: "16px 0 0", lineHeight: 1.7 }}>
            Billed to<br />{parties?.client?.legalName}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 30, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>INVOICE</p>
          <p style={{ fontSize: 14, margin: "8px 0 0", fontFamily: font.mono }}>{milestone.invoiceId}</p>
        </div>
      </div>

      <p style={{ fontSize: 19, fontWeight: 500, margin: "0 0 16px", letterSpacing: "-0.01em" }}>Description</p>
      <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", marginBottom: 20 }}>
        <tbody>
          <tr>
            <td style={{ padding: "10px 0", borderBottom: `1px solid ${paper.rule}` }}>
              {milestone.label}
              <span style={{ color: paper.inkMuted, fontSize: 13 }}> — {contract?.terms?.description}</span>
            </td>
            <td style={{ padding: "10px 0", borderBottom: `1px solid ${paper.rule}`, textAlign: "right" }}>
              {milestone.amountDue?.toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 44 }}>
        <div style={{ width: 240 }}>
          <Row k="Total" v={`${milestone.amountDue?.toFixed(2)} ${milestone.currency}`} bold />
          <Row k="Due" v={milestone.dueOn} />
          <Row k="Status" v={milestone.status} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        <div>
          <p style={{ fontSize: 17, fontWeight: 500, margin: "0 0 12px", letterSpacing: "-0.01em" }}>Settlement</p>
          <p style={{ fontSize: 11, letterSpacing: "0.08em", color: paper.inkMuted, margin: "0 0 3px", textTransform: "uppercase" }}>Deposit address</p>
          <p style={{ fontSize: 11, fontFamily: font.mono, margin: "0 0 10px", wordBreak: "break-all" }}>{milestone.depositAddress}</p>
          <p style={{ fontSize: 11, letterSpacing: "0.08em", color: paper.inkMuted, margin: "0 0 3px", textTransform: "uppercase" }}>Chains accepted</p>
          <p style={{ fontSize: 12, margin: 0 }}>Base, Arbitrum</p>
        </div>
        <div>
          <p style={{ fontSize: 17, fontWeight: 500, margin: "0 0 12px", letterSpacing: "-0.01em" }}>Terms</p>
          <p style={{ fontSize: 12, color: paper.inkMuted, margin: 0, lineHeight: 1.7 }}>
            This invoice is issued under deed {contract?.contractId}, signed by both parties.
            The same address is valid on every supported chain. Payment is recognised only
            when confirmed on-chain.
          </p>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${paper.rule}`, paddingTop: 16, marginTop: 32 }}>
        <p style={{ fontSize: 11, fontFamily: font.mono, margin: 0, color: paper.inkMuted, wordBreak: "break-all" }}>
          commitment {milestone.commitment}
        </p>
      </div>
    </div>
  );
}

function Row({ k, v, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0" }}>
      <span style={{ color: paper.inkMuted }}>{k}</span>
      <span style={{ fontWeight: bold ? 600 : 400, textTransform: k === "Status" ? "capitalize" : "none" }}>{v}</span>
    </div>
  );
}

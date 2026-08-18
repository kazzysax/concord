// ui.js
// Shared style objects for app-shell screens, all derived from theme.js so
// there's one place to change the palette. Documents (deed, invoice) do NOT
// use these - they use the paper palette instead, deliberately.

import { app, font } from "./theme.js";

export const card = {
  background: app.surface,
  border: `1px solid ${app.border}`,
  borderRadius: 14,
  padding: "1.25rem 1.5rem",
  marginBottom: 12
};

export const label = { fontSize: 13, color: app.textMuted };

export const input = {
  background: app.bg,
  border: `1px solid ${app.border}`,
  borderRadius: 9,
  padding: "10px 12px",
  fontSize: 14,
  color: app.text,
  width: "100%",
  boxSizing: "border-box",
  fontFamily: font.sans,
  outline: "none"
};

export const btn = {
  background: "transparent",
  color: app.text,
  border: `1px solid ${app.borderStrong}`,
  borderRadius: 9,
  padding: "9px 16px",
  fontSize: 14,
  cursor: "pointer",
  fontFamily: font.sans
};

export const btnPrimary = {
  background: app.accent,
  color: app.bg,
  border: "none",
  borderRadius: 9,
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: font.sans
};

export const badge = (kind) => {
  const map = {
    pending: { bg: "rgba(214,158,46,0.15)", fg: "#E3B341" },
    underpaid: { bg: "rgba(214,158,46,0.15)", fg: "#E3B341" },
    paid: { bg: "rgba(111,227,196,0.15)", fg: app.accent },
    settled: { bg: "rgba(111,227,196,0.15)", fg: app.accent },
    negotiating: { bg: "rgba(214,158,46,0.15)", fg: "#E3B341" },
    agreed: { bg: "rgba(111,227,196,0.15)", fg: app.accent }
  };
  const c = map[kind] || map.pending;
  return { background: c.bg, color: c.fg, fontSize: 11, padding: "4px 10px", borderRadius: 999, textTransform: "capitalize" };
};

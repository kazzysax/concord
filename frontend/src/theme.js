// theme.js
// Two palettes deliberately: the app shell is dark teal (navigation,
// negotiation, dashboards) and generated documents are cream paper. The
// contrast is the point - a deed should look like a document, not like a
// screen, so it reads as something you'd print and file.

export const app = {
  bg: "#0A2622",
  surface: "#0E322D",
  surfaceRaised: "#123B35",
  border: "#1C4A43",
  borderStrong: "#286058",
  accent: "#6FE3C4",
  accentDim: "#3FA98C",
  text: "#EDF2F0",
  textMuted: "#8FA8A2",
  textFaint: "#5F7B76"
};

export const paper = {
  bg: "#F2F1ED",
  ink: "#141414",
  inkMuted: "#5A5A56",
  rule: "#C9C7C0",
  accent: "#0A2622"
};

export const font = {
  sans: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "'Instrument Serif', 'Times New Roman', Georgia, serif",
  mono: "'SF Mono', 'Roboto Mono', Menlo, monospace"
};

// Headline pattern from the reference: bold sans with one serif-italic word
// carrying the emphasis. Used across landing and section headers.
export const headline = {
  fontFamily: font.sans,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  lineHeight: 1.1
};

export const headlineAccent = {
  fontFamily: font.serif,
  fontStyle: "italic",
  fontWeight: 400,
  letterSpacing: "-0.01em"
};

export const appCard = {
  background: app.surface,
  border: `1px solid ${app.border}`,
  borderRadius: 14,
  padding: "1.25rem 1.5rem"
};

export const pill = {
  background: app.accent,
  color: app.bg,
  border: "none",
  borderRadius: 999,
  padding: "10px 22px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: font.sans
};

export const pillGhost = {
  background: "transparent",
  color: app.text,
  border: `1px solid ${app.borderStrong}`,
  borderRadius: 999,
  padding: "10px 22px",
  fontSize: 14,
  cursor: "pointer",
  fontFamily: font.sans
};

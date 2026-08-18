import React, { useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { app, font, headline, headlineAccent } from "./theme.js";

// Drop your signing photo at frontend/public/signing.jpg. Without it the
// left panel falls back to flat teal and still reads fine.
const SIGNING_IMAGE = "/signing.jpg";

export default function Login({ onSignedIn }) {
  const { login } = useAuth();
  const [loading, setLoading] = useState(null);

  const go = async (method) => {
    setLoading(method);
    await login();
    setLoading(null);
    onSignedIn();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "2rem 0", fontFamily: font.sans }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", width: "100%", maxWidth: 880,
        background: app.surface, border: `1px solid ${app.border}`, borderRadius: 18, overflow: "hidden", minHeight: 500
      }}>

        <div style={{
          position: "relative",
          backgroundImage: `url(${SIGNING_IMAGE})`,
          backgroundSize: "cover", backgroundPosition: "center",
          backgroundColor: app.surfaceRaised,
          display: "flex", flexDirection: "column", justifyContent: "flex-end"
        }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,38,34,0.35) 0%, rgba(10,38,34,0.80) 60%, rgba(10,38,34,0.96) 100%)" }} />
          <div style={{ position: "relative", padding: "2rem 1.75rem" }}>
            <p style={{ fontSize: 12, color: app.accent, margin: "0 0 10px", letterSpacing: "0.08em" }}>Concord</p>
            <p style={{ ...headline, fontSize: 26, margin: 0, color: app.text, lineHeight: 1.25 }}>
              Turn a conversation into an <span style={{ ...headlineAccent, fontSize: 25 }}>agreement</span> neither side can rewrite.
            </p>
          </div>
        </div>

        <div style={{ padding: "3rem 2.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <p style={{ ...headline, fontSize: 26, margin: "0 0 10px", color: app.text }}>Sign in</p>
          <p style={{ fontSize: 13, color: app.textMuted, margin: "0 0 32px", lineHeight: 1.6 }}>
            Negotiate, sign, and settle deals in one place. Either method gives you a
            wallet ready for settlement.
          </p>

          <button
            onClick={() => go("wallet")}
            style={{
              width: "100%", background: app.accent, color: app.bg, border: "none",
              borderRadius: 10, padding: "13px 16px", fontSize: 14, fontWeight: 500,
              cursor: "pointer", marginBottom: 10, fontFamily: font.sans
            }}>
            {loading === "wallet" ? "Connecting…" : "Connect wallet"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: app.border }} />
            <span style={{ fontSize: 11, color: app.textFaint }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: app.border }} />
          </div>

          <button
            onClick={() => go("google")}
            style={{
              width: "100%", background: "transparent", color: app.text,
              border: `1px solid ${app.borderStrong}`, borderRadius: 10,
              padding: "13px 16px", fontSize: 14, cursor: "pointer",
              fontFamily: font.sans, display: "flex", alignItems: "center", justifyContent: "center", gap: 10
            }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>G</span>
            {loading === "google" ? "Signing in…" : "Google"}
          </button>

          <p style={{ fontSize: 11, color: app.textFaint, margin: "28px 0 0", lineHeight: 1.6, textAlign: "center" }}>
            No wallet? Signing in with Google creates one for you automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

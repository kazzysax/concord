import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import ConcordLink from "./ConcordLink.jsx";
import Landing from "./Landing.jsx";
import Login from "./Login.jsx";
import App from "./App.jsx";
import { app } from "./theme.js";

function Router() {
  const { authenticated } = useAuth();
  const [screen, setScreen] = useState("landing");

  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const match = path.match(/^\/c\/([^/]+)/);

  if (match) {
    return <ConcordLink concordId={decodeURIComponent(match[1])} inviteToken={params.get("token")} />;
  }
  if (authenticated) return <App />;
  if (screen === "login") return <Login onSignedIn={() => setScreen("dashboard")} />;
  return <Landing onGetStarted={() => setScreen("login")} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <div style={{ minHeight: "100vh", background: app.bg }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 1.5rem 4rem" }}>
          <Router />
        </div>
      </div>
    </AuthProvider>
  </React.StrictMode>
);

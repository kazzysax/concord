// AuthContext.jsx
// Real Privy when VITE_PRIVY_APP_ID is set, falls back to a fake local
// session otherwise so the app still runs without credentials during setup.
// Both paths expose the same shape (login, authenticated, user, getAccessToken,
// signMessage) so nothing downstream needs to know which mode is active.
//
// Requires: npm install @privy-io/react-auth (already in package.json).
// Check current docs at docs.privy.io before relying on this against a real
// app - hook names have shifted across SDK versions in the past.

import React, { createContext, useContext, useState, useMemo } from "react";
import { PrivyProvider, usePrivy, useSignMessage } from "@privy-io/react-auth";

const AuthCtx = createContext(null);
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

export function AuthProvider({ children }) {
  if (PRIVY_APP_ID) {
    return (
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          loginMethods: ["wallet", "google", "email"],
          embeddedWallets: { createOnLogin: "users-without-wallets" },
          appearance: { theme: "dark", accentColor: "#6FE3C4" }
        }}
      >
        <RealPrivyBridge>{children}</RealPrivyBridge>
      </PrivyProvider>
    );
  }
  return <DevAuthProvider>{children}</DevAuthProvider>;
}

// ---------------------------------------------------------------- real
function RealPrivyBridge({ children }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { signMessage: privySignMessage } = useSignMessage();

  const value = useMemo(() => ({
    ready,
    authenticated,
    user: user ? { id: user.id, wallet: user.wallet?.address || user.linkedAccounts?.find(a => a.type === "wallet")?.address } : null,
    login: () => login(),
    logout,
    getAccessToken,
    // Real e-sign: signs with the actual embedded or connected wallet.
    // Returns { signature, wallet } - matches what concord.js's /accept
    // route verifies via ethers.verifyMessage.
    signMessage: async (message) => {
      const { signature } = await privySignMessage({ message });
      return { signature, wallet: user?.wallet?.address };
    }
  }), [ready, authenticated, user]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// ---------------------------------------------------------------- dev
// No real identity verification - tokens are unsigned. auth.js's DEV_AUTH
// mode on the backend expects exactly this shape and refuses to boot in
// production alongside it (see auth.js's own guard). Signatures ARE real
// ECDSA though - only the login/identity half is stubbed here, not the
// cryptography a signature check relies on.
function DevAuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const login = async (fakeUserId) => {
    const id = fakeUserId || `user-${Math.random().toString(36).slice(2, 8)}`;
    const { ethers } = await import("ethers");
    const wallet = ethers.Wallet.createRandom();
    setUser({ id, wallet: wallet.address, _pk: wallet.privateKey });
  };

  const logout = () => setUser(null);

  const getAccessToken = async () => {
    if (!user) return null;
    const payload = btoa(JSON.stringify({ sub: user.id, wallet: user.wallet }));
    return `stub.${payload}.sig`;
  };

  const signMessage = async (message) => {
    if (!user) throw new Error("not signed in");
    const { ethers } = await import("ethers");
    const signer = new ethers.Wallet(user._pk);
    const signature = await signer.signMessage(ethers.getBytes(message));
    return { signature, wallet: user.wallet };
  };

  const value = { ready: true, authenticated: !!user, user, login, logout, getAccessToken, signMessage };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}

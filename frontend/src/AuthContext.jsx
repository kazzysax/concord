import React, { createContext, useContext, useMemo } from "react";
import { PrivyProvider, usePrivy, useSignMessage } from "@privy-io/react-auth";

const AuthCtx = createContext(null);
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

if (!PRIVY_APP_ID) {
  throw new Error("VITE_PRIVY_APP_ID is required. Concord no longer ships with a mock auth provider.");
}

export function AuthProvider({ children }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["wallet", "google", "email"],
        embeddedWallets: { createOnLogin: "users-without-wallets" },
        appearance: { theme: "dark", accentColor: "#6FE3C4" }
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}

function PrivyBridge({ children }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { signMessage: privySignMessage } = useSignMessage();

  const value = useMemo(() => ({
    ready,
    authenticated,
    user: user
      ? {
          id: user.id,
          wallet: user.wallet?.address || user.linkedAccounts?.find((account) => account.type === "wallet")?.address || null
        }
      : null,
    login: () => login(),
    logout,
    getAccessToken,
    signMessage: async (message) => {
      const { signature } = await privySignMessage({ message });
      return {
        signature,
        wallet: user?.wallet?.address || user?.linkedAccounts?.find((account) => account.type === "wallet")?.address || null
      };
    }
  }), [ready, authenticated, user, login, logout, getAccessToken, privySignMessage]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}

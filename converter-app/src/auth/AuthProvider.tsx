import React, { useEffect, useState } from "react";
import { UserSession } from "@esri/arcgis-rest-auth";
import {
  clientId,
  redirectUri,
  SESSION_KEY,
  saveSession,
  restoreSession,
  getTokenFromHash,
  getUserDetails
} from "./AuthUtils";
import { captureRefactorFlagIfPresent, restoreRefactorFlagToUrl } from "../refactor/util/featureFlag";
import { AuthContext } from "./AuthContext";
import type { UserInfo } from "./AuthContext";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(restoreSession());
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  // Capture whether refactor was requested on this load
  const [initialRefactor] = useState<boolean>(() => {
    return new URLSearchParams(window.location.search).get("refactor") === "1";
  }); 

  useEffect(() => {
    const { token, expires } = getTokenFromHash();
    if (token) {
      // Only use sessionStorage flag (set during signIn) OR initialRefactor
      const refactorFlag =
        sessionStorage.getItem("refactorFlag") === "1" || initialRefactor;
      const s = new UserSession({
        clientId,
        redirectUri,
        token,
        tokenExpires: expires 
          ? new Date(expires) 
          : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        portal: "https://www.arcgis.com/sharing/rest",
      });
      setTimeout(() => setSession(s), 0); // defer state update to avoid synchronous setState lint warning
      saveSession(s);

      // Fetch and set user info after successful sign-in
      getUserDetails(token).then(details => {
        setUserInfo({
          username: details.username,
          role: details.role,
          userType: details.userLicenseTypeId
        });
      }).catch(() => setUserInfo(null));
      // Restore refactor flag to URL if originally present
      if (refactorFlag) {
        restoreRefactorFlagToUrl();
      } else {
        sessionStorage.removeItem("refactorFlag");
      }
      setTimeout(() => setLoading(false), 0);
      // Clear one‑time session flag
      sessionStorage.removeItem("refactorFlag");
      return;
    }
    setTimeout(() => setLoading(false), 0);
  }, [initialRefactor]);

  // Display the updated token
  useEffect(() => {
    if (session) {
      console.log("Session token (updated):", session.token);
    }
  }, [session]);


  const signIn = () => {
    captureRefactorFlagIfPresent();
    UserSession.beginOAuth2({
      clientId,
      redirectUri,
      responseType: "token",
      popup: false
    });
  };

  const signOut = () => {
    if (session) {
      setSession(null);
      sessionStorage.removeItem(SESSION_KEY);
    }
  };

  return (
    <AuthContext.Provider 
      value={{ 
        session, 
        token: session?.token ?? null, 
        signIn, 
        signOut, 
        loading,
        userInfo,
        setUserInfo 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
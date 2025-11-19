import React, { useEffect, useState } from "react";
import { UserSession } from "@esri/arcgis-rest-auth";
import { clientId, redirectUri, SESSION_KEY, saveSession, restoreSession, getTokenFromHash, getUserDetails } from "./AuthUtils";
import { AuthContext } from "./AuthContext";
import type { UserInfo } from "./AuthContext";

const authMethod = import.meta.env.VITE_AUTH_METHOD;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(restoreSession());
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    const { token, expires } = getTokenFromHash();
    if (token) {
      const s = new UserSession({
        clientId,
        redirectUri,
        token,
        tokenExpires: expires ? new Date(expires) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        portal: "https://www.arcgis.com/sharing/rest",
      });
      setSession(s);
      console.log("Session token:",session?.token)
      saveSession(s);
      setLoading(false);

      // Fetch and set user info after successful sign-in
      getUserDetails(token).then(details => {
        setUserInfo({
          username: details.username,
          role: details.role,
          userType: details.userLicenseTypeId
        });
      }).catch(() => setUserInfo(null));
      // Clear the hash from the window
      window.history.replaceState({}, document.title, redirectUri);
      return;
    }
    setLoading(false);
  }, []);

  // Display the updated token
  useEffect(() => {
    if (session) {
      console.log("Session token (updated):", session.token);
    }
  }, [session]);


  const signIn = () => {
    // Use different OAuth2 methods for dev and prod
    if (authMethod === "dev") {
      UserSession.beginOAuth2({
        clientId,
        redirectUri,
        responseType: "token",
        popup: false // Use redirect
      });
    } else {
      UserSession.beginOAuth2({
        clientId,
        redirectUri,
        responseType: "token",
        popup: false // Use redirect for prod
      });
    }
  };

  const signOut = () => {
    if (session) {
      setSession(null);
      sessionStorage.removeItem(SESSION_KEY);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      session, 
      token: session?.token ?? null, 
      signIn, 
      signOut, 
      loading,
      userInfo,
      setUserInfo }}>
      {children}
    </AuthContext.Provider>
  );
};
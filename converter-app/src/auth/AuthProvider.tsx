import React, { useEffect, useState } from "react";
import { UserSession } from "@esri/arcgis-rest-auth";
import {
  clientId,
  redirectUri,
  SESSION_KEY,
  saveSession,
  restoreSession,
  getTokenFromHash,
  getUserDetails,
  saveUserInfo,
  restoreUserInfo
} from "./AuthUtils";
import { AuthContext } from "./AuthContext";
import type { UserInfo } from "./AuthContext";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(restoreSession());
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(restoreUserInfo<UserInfo>());

  // Capture whether refactor was requested on this load
  const [initialRefactor] = useState<boolean>(() => {
    return new URLSearchParams(window.location.search).get("refactor") === "1";
  }); 

  // Handle new OAuth redirect with token in hash
  useEffect(() => {
    const { token, expires } = getTokenFromHash();
    if (!token) {
      // No new token in hash; just mark loading false (restored session handled separately)
      setTimeout(() => setLoading(false), 0);
      return;
    }
    const s = new UserSession({
      clientId,
      redirectUri,
      token,
      tokenExpires: expires ? new Date(expires) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      portal: "https://www.arcgis.com/sharing/rest",
    });
    setSession(s);
    saveSession(s);
    // Clean up OAuth hash fragment (remove access_token from URL after parsing)
    try {
      if (window.location.hash && /access_token=/.test(window.location.hash)) {
        const cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState({}, "", cleanUrl);
      }
    } catch {/* ignore history errors */}
    getUserDetails(token)
      .then(details => {
        const base = s.portal.replace(/\/$/, "");
        const extendedUrl = `${base}/community/users/${details.username}?f=json&token=${token}`;
        return fetch(extendedUrl)
          .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
          .then(ext => {
            const thumbUrl = ext?.thumbnail
              ? `${base}/community/users/${details.username}/info/${ext.thumbnail}?token=${token}`
              : undefined;
            const info: UserInfo = {
              username: details.username,
              role: details.role,
              userType: details.userLicenseTypeId,
              fullName: ext?.fullName || details.username,
              thumbnailUrl: thumbUrl,
            };
            setUserInfo(info);
            saveUserInfo(info);
          })
          .catch(() => {
            const info: UserInfo = {
              username: details.username,
              role: details.role,
              userType: details.userLicenseTypeId,
            };
            setUserInfo(info);
            saveUserInfo(info);
          });
      })
      .catch(() => setUserInfo(null))
  }, [initialRefactor]);

  // When a session was restored (no new token in hash) and userInfo wasn't cached, fetch details once.
  useEffect(() => {
    if (session && !userInfo && !loading) {
      const token = session.token;
      getUserDetails(token)
        .then(details => {
          const base = session.portal.replace(/\/$/, "");
          const extendedUrl = `${base}/community/users/${details.username}?f=json&token=${token}`;
          return fetch(extendedUrl)
            .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
            .then(ext => {
              const thumbUrl = ext?.thumbnail
                ? `${base}/community/users/${details.username}/info/${ext.thumbnail}?token=${token}`
                : undefined;
              const info: UserInfo = {
                username: details.username,
                role: details.role,
                userType: details.userLicenseTypeId,
                fullName: ext?.fullName || details.username,
                thumbnailUrl: thumbUrl,
              };
              setUserInfo(info);
              saveUserInfo(info);
            });
        })
        .catch(() => { /* ignore fetch errors on restore */ });
    }
  }, [session, userInfo, loading]);

  // Display the updated token
  useEffect(() => {
    if (session) {
      console.log("Session token (updated):", session.token);
    }
  }, [session]);


  const signIn = () => {
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
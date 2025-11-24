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
import { captureRefactorFlagIfPresent, restoreRefactorFlagToUrl } from "../refactor/util/featureFlag";
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

  useEffect(() => {
    const { token, expires } = getTokenFromHash();
    if (!token) {
      setTimeout(() => setLoading(false), 0);
      return;
    }
    const refactorFlag = sessionStorage.getItem("refactorFlag") === "1" || initialRefactor;
    const s = new UserSession({
      clientId,
      redirectUri,
      token,
      tokenExpires: expires ? new Date(expires) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      portal: "https://www.arcgis.com/sharing/rest",
    });
    setTimeout(() => setSession(s), 0);
    saveSession(s);
    // Basic user info first
    getUserDetails(token)
      .then(details => {
        const base = s.portal.replace(/\/$/, "");
        const extendedUrl = `${base}/community/users/${details.username}?f=json&token=${token}`;
        fetch(extendedUrl)
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
      .finally(() => {
          // If we restored a session (no hash token) and lack cached userInfo, fetch it once.
          useEffect(() => {
            if (session && !userInfo) {
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
                .catch(() => {/* ignore */});
            }
          }, [session, userInfo]);
        if (refactorFlag) {
          restoreRefactorFlagToUrl();
        } else {
          sessionStorage.removeItem("refactorFlag");
        }
        setTimeout(() => setLoading(false), 0);
        sessionStorage.removeItem("refactorFlag");
      });
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
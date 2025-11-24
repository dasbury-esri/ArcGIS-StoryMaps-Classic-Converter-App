import { UserSession } from "@esri/arcgis-rest-auth";

export const clientId = import.meta.env.VITE_CLIENT_ID;
export const redirectUri = import.meta.env.VITE_REDIRECT_URI;
export const SESSION_KEY = "arcgis_session";
export const USER_INFO_KEY = "arcgis_user_info";

export function saveSession(session: UserSession) {
  try {
    const serialized = session.serialize();
    sessionStorage.setItem(SESSION_KEY, serialized);
  } catch (error) {
    console.warn("Could not serialize session:", error);
  }
}

export function restoreSession(): UserSession | null {
  const serialized = sessionStorage.getItem(SESSION_KEY);
  if (serialized) {
    try {
      return UserSession.deserialize(serialized);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
  return null;
}

export function saveUserInfo(info: unknown) {
  try {
    sessionStorage.setItem(USER_INFO_KEY, JSON.stringify(info));
  } catch (error) {
    console.warn("Could not persist userInfo", error);
  }
}

export function restoreUserInfo<T = any>(): T | null {
  const raw = sessionStorage.getItem(USER_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    sessionStorage.removeItem(USER_INFO_KEY);
    return null;
  }
}

export function getTokenFromHash(): { token: string | null; expires: number | null } {
  const hash = window.location.hash.substring(1);
  console.log("[AuthUtils.ts]Hash: ", hash)
  const params = new URLSearchParams(hash);
  const token = params.get("access_token") || params.get("token");
  const expiresIn = params.get("expires_in");
  return {
    token,
    expires: expiresIn ? Date.now() + parseInt(expiresIn, 10) * 1000 : null,
  };
}

export async function getUserDetails(token: string) {
  const res = await fetch(`https://www.arcgis.com/sharing/rest/community/self?f=json&token=${token}`);
  const json = await res.json();
  return {
    username: json.username,
    role: json.role,
    userLicenseTypeId: json.userLicenseTypeId
  };
}
import { createContext } from "react";
import type { UserSession } from "@esri/arcgis-rest-auth";

export type UserInfo = {
  username: string;
  role: string;
  userType: string;
};

export type AuthContextType = {
  session: UserSession | null;
  token: string | null;
  signIn: () => void;
  signOut: () => void;
  loading: boolean;
  userInfo: UserInfo | null;
  setUserInfo: (info: UserInfo | null) => void;
};

export const AuthContext = createContext<AuthContextType>({
  session: null,
  token: null,
  signIn: () => {},
  signOut: () => {},
  loading: false,
});
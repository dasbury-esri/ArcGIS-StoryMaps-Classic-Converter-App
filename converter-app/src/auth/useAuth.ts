import { useContext } from "react";
import { AuthContext } from "./AuthContext";
import type { AuthContextType } from "./AuthContext";

export const useAuth = (): AuthContextType => useContext(AuthContext);
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type UserRole = "ADMIN" | "EDUCATOR" | "STUDENT";

export type AppUserProfile = {
  uid: string;
  role: UserRole;
  educatorId?: string;
  tenantSlug?: string;         // ✅ KEPT for backward compatibility
  enrolledTenants?: string[];  // ✅ NEW: Array of slugs
  displayName?: string;
  email?: string;
};

type AuthContextValue = {
  firebaseUser: User | null;
  profile: AppUserProfile | null;
  loading: boolean;
  isAuthed: boolean;
  role: UserRole | null;
  educatorId: string | null;
  tenantSlug: string | null;
  enrolledTenants: string[]; 
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(uid: string): Promise<AppUserProfile | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;

  const role = data.role as UserRole | undefined;
  if (role !== "ADMIN" && role !== "EDUCATOR" && role !== "STUDENT") return null;

  // --- 🛡️ SAFETY LOGIC START ---
  // If database has array, use it. If not, use the old string wrapped in an array.
  let enrolledTenants: string[] = [];
  
  if (Array.isArray(data.enrolledTenants)) {
    enrolledTenants = data.enrolledTenants;
  } else if (typeof data.tenantSlug === "string") {
    enrolledTenants = [data.tenantSlug]; // <--- This saves old users!
  }
  // --- 🛡️ SAFETY LOGIC END ---

  return {
    uid,
    role,
    educatorId: typeof data.educatorId === "string" ? data.educatorId : undefined,
    tenantSlug: typeof data.tenantSlug === "string" ? data.tenantSlug : undefined,
    enrolledTenants, // Always returns an array now
    displayName: typeof data.displayName === "string" ? data.displayName : undefined,
    email: typeof data.email === "string" ? data.email : undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const p = await fetchProfile(u.uid);
        setProfile(p);
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      firebaseUser,
      profile,
      loading,
      isAuthed: !!firebaseUser,
      role: profile?.role ?? null,
      educatorId: profile?.educatorId ?? null,
      tenantSlug: profile?.tenantSlug ?? null,
      enrolledTenants: profile?.enrolledTenants || [],
    };
  }, [firebaseUser, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

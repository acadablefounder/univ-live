import React, { createContext, useContext, useEffect, useState } from "react";
import { getTenantSlugFromHostname } from "@/lib/tenant";
import { db, auth } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthProvider";
import { signOut } from "firebase/auth";
import { toast } from "sonner";

export type TenantProfile = {
  educatorId: string;
  tenantSlug: string;
  coachingName?: string;
  tagline?: string;
  contact?: { phone?: string; email?: string; address?: string };
  socials?: Record<string, string | null>;
  websiteConfig?: any;
};

type TenantContextValue = {
  tenant: TenantProfile | null;
  tenantSlug: string | null;
  loading: boolean;
  isTenantDomain: boolean;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const tenantSlug = getTenantSlugFromHostname();
  const isTenantDomain = !!tenantSlug;

  // 1. Load Tenant Data (Standard logic - unchanged)
  useEffect(() => {
    let mounted = true;
    async function loadTenant() {
      setLoading(true);
      setTenant(null);
      if (!tenantSlug) {
        setLoading(false);
        return;
      }

      try {
        const q = query(collection(db, "educators"), where("slug", "==", tenantSlug)); // Note: Ensure field is 'slug' or 'tenantSlug' based on your DB
        const snaps = await getDocs(q);
        if (!mounted) return;

        if (!snaps.empty) {
          const d = snaps.docs[0].data() as any;
          setTenant({
            educatorId: snaps.docs[0].id,
            tenantSlug: d.slug || d.tenantSlug || tenantSlug, // Handle variations
            coachingName: d.coachingName || "",
            tagline: d.tagline || "",
            contact: d.contact || {},
            socials: d.socials || {},
            websiteConfig: d.websiteConfig || null,
          });
        } else {
          setTenant(null);
        }
      } catch (err) {
        console.error("Failed to load tenant", err);
        setTenant(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadTenant();
    return () => { mounted = false; };
  }, [tenantSlug]);

  // 2. Enforce Security (UPDATED & SAFE)
  useEffect(() => {
    if (!profile || !isTenantDomain || !tenantSlug) return;

    if (profile.role === "STUDENT") {
      
      // --- 🛡️ SAFETY LOGIC START ---
      // 1. Check New Array
      const enrolledList = profile.enrolledTenants || [];
      
      // 2. Check Old String (For Legacy Users)
      const legacyMatch = profile.tenantSlug === tenantSlug;
      
      // 3. Allow if EITHER is true
      const isAuthorized = enrolledList.includes(tenantSlug) || legacyMatch;
      // --- 🛡️ SAFETY LOGIC END ---

      if (!isAuthorized) {
        (async () => {
          try {
            await signOut(auth);
          } catch (e) {
             // ignore
          } finally {
            toast.error("You are not registered with this coaching institute. Please Register first.");
          }
        })();
      }
    }
  }, [profile, isTenantDomain, tenantSlug]);

  const value: TenantContextValue = {
    tenant,
    tenantSlug,
    loading,
    isTenantDomain,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}

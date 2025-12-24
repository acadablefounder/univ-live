// src/pages/tenant/TenantHome.tsx
import { useTenant } from "@/contexts/TenantProvider";
import Theme1Layout from "@/themes/coaching/theme1/Theme1Layout";

export default function TenantHome() {
  const { tenant, loading } = useTenant();

  if (loading) return null;
  if (!tenant) return null;

  return <Theme1Layout />;
}


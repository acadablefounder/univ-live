// src/pages/tenant/TenantCourses.tsx
import { useTenant } from "@/contexts/TenantProvider";

export default function TenantCourses() {
  const { tenant, loading } = useTenant();

  if (loading) return null;
  if (!tenant) return null;

  return (
    <div className="container py-20">
      <h1 className="text-3xl font-bold">Courses</h1>
      {/* later plug course listing */}
    </div>
  );
}


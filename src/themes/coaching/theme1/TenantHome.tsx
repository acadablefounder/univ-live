// src/pages/tenant/TenantHome.tsx
import React from "react";
import { useTenant } from "@/contexts/TenantProvider";
import Theme1Layout from "@/themes/coaching/theme1/Theme1Layout";
import Theme1Hero from "@/themes/coaching/theme1/Theme1Hero";
import Theme1Stats from "@/themes/coaching/theme1/Theme1Stats";
import Theme1CoursesPreview from "@/themes/coaching/theme1/Theme1CoursesPreview";
import Theme1Achievements from "@/themes/coaching/theme1/Theme1Achievements";
import Theme1Faculty from "@/themes/coaching/theme1/Theme1Faculty";
import Theme1Testimonials from "@/themes/coaching/theme1/Theme1Testimonials";
import Theme1FAQ from "@/themes/coaching/theme1/Theme1FAQ";
import Theme1CTA from "@/themes/coaching/theme1/Theme1CTA";

export default function TenantHome() {
  const { tenant, loading } = useTenant();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!tenant) {
    // If subdomain not found in DB, you might want to show a generic 404 or fallback
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Coaching not found</h2>
          <p className="text-muted-foreground mt-2">This coaching website does not exist. Check the URL or contact support.</p>
        </div>
      </div>
    );
  }

  // Switch between themes later based on tenant.websiteConfig.theme
  return (
    <Theme1Layout>
      <Theme1Hero />
      <Theme1Stats />
      <Theme1CoursesPreview />
      <Theme1Achievements />
      <Theme1Faculty />
      <Theme1Testimonials />
      <Theme1FAQ />
      <Theme1CTA />
    </Theme1Layout>
  );
}


// src/AppRoutes.tsx
import React from "react";
import { Routes, Route } from "react-router-dom";
import { useTenant } from "@/contexts/TenantProvider";
import TenantHome from "@/pages/tenant/TenantHome";
import TenantCourses from "@/pages/tenant/TenantCourses";

import Index from "@/pages/Index";
import HowItWorks from "@/pages/HowItWorks";
import ForCoaching from "@/pages/ForCoaching";
import ForStudents from "@/pages/ForStudents";
import OurCourses from "@/pages/OurCourses";
import Pricing from "@/pages/Pricing";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import NotFound from "@/pages/NotFound";
import RequireRole from "@/components/auth/RequireRole";

// Educator Dashboard
import EducatorLayout from "@/components/educator/EducatorLayout";
import EducatorDashboard from "@/pages/educator/Dashboard";
import Learners from "@/pages/educator/Learners";
import TestSeries from "@/pages/educator/TestSeries";
import AccessCodes from "@/pages/educator/AccessCodes";
import Analytics from "@/pages/educator/Analytics";
import Messages from "@/pages/educator/Messages";
import WebsiteSettings from "@/pages/educator/WebsiteSettings";
import Billing from "@/pages/educator/Billing";
import Settings from "@/pages/educator/Settings";

// Student Dashboard
import StudentLayout from "@/pages/student/StudentLayout";
import StudentDashboard from "@/pages/student/StudentDashboard";
import StudentTests from "@/pages/student/StudentTests";
import StudentTestDetails from "@/pages/student/StudentTestDetails";
import StudentCBTAttempt from "@/pages/student/StudentCBTAttempt";
import StudentAttempts from "@/pages/student/StudentAttempts";
import StudentAttemptDetails from "@/pages/student/StudentAttemptDetails";
import StudentResults from "@/pages/student/StudentResults";
import StudentRankings from "@/pages/student/StudentRankings";
import StudentAnalytics from "@/pages/student/StudentAnalytics";
import StudentMessages from "@/pages/student/StudentMessages";
import StudentSettings from "@/pages/student/StudentSettings";

export default function AppRoutes() {
  const { isTenantDomain } = useTenant();

  return (
    <Routes>
      {/* TENANT DOMAIN */}
      {isTenantDomain ? (
        <>
          <Route path="/" element={<TenantHome />} />
          <Route path="/courses" element={<TenantCourses />} />
          <Route path="*" element={<NotFound />} />
        </>
      ) : (
        <>
          {/* MAIN DOMAIN */}
          <Route path="/" element={<Index />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/for-coaching" element={<ForCoaching />} />
          <Route path="/for-students" element={<ForStudents />} />
          <Route path="/our-courses" element={<OurCourses />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Educator */}
          <Route
            path="/educator"
            element={
              <RequireRole allow={["EDUCATOR", "ADMIN"]} redirectTo="/login?role=educator">
                <EducatorLayout />
              </RequireRole>
            }
          >
            <Route index element={<EducatorDashboard />} />
            <Route path="dashboard" element={<EducatorDashboard />} />
            <Route path="learners" element={<Learners />} />
            <Route path="test-series" element={<TestSeries />} />
            <Route path="access-codes" element={<AccessCodes />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="messages" element={<Messages />} />
            <Route path="website-settings" element={<WebsiteSettings />} />
            <Route path="billing" element={<Billing />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Student */}
          <Route
            path="/student"
            element={
              <RequireRole allow={["STUDENT", "ADMIN"]} redirectTo="/login?role=student">
                <StudentLayout />
              </RequireRole>
            }
          >
            <Route index element={<StudentDashboard />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="tests" element={<StudentTests />} />
            <Route path="tests/:testId" element={<StudentTestDetails />} />
            <Route path="tests/:testId/attempt" element={<StudentCBTAttempt />} />
            <Route path="attempts" element={<StudentAttempts />} />
            <Route path="attempts/:attemptId" element={<StudentAttemptDetails />} />
            <Route path="results/:attemptId" element={<StudentResults />} />
            <Route path="rankings" element={<StudentRankings />} />
            <Route path="analytics" element={<StudentAnalytics />} />
            <Route path="messages" element={<StudentMessages />} />
            <Route path="settings" element={<StudentSettings />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </>
      )}
    </Routes>
  );
}


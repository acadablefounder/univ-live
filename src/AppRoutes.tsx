import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantProvider";

// Route Guards
import RequireRole from "@/components/auth/RequireRole";
import StudentRoute from "@/components/routes/StudentRoute"; // <--- IMPORT THIS

// Tenant / Public Pages
import TenantHome from "@/themes/coaching/theme1/TenantHome"; 
import TenantCourses from "@/themes/coaching/theme1/TenantCourses";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import NotFound from "@/pages/NotFound";

// Platform Pages (Univ.Live main site)
import Index from "@/pages/Index";
import HowItWorks from "@/pages/HowItWorks";
import Pricing from "@/pages/Pricing";

import AdminTestManager from "./pages/AdminTestManager";

// ✅ Admin pages you added in /pages/admin
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminQuestions from "@/pages/admin/Questions";
import AdminTestBank from "@/pages/admin/TestBank";
import AdminTestForm from "@/pages/admin/TestForm";
import AdminLayout from "./pages/admin/AdminLayout";

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
      {/* =========================================================
          SCENARIO A: TENANT WEBSITE (e.g. coaching.univ.live)
         ========================================================= */}
      {isTenantDomain ? (
        <>
          {/* --- Public Routes (Open to everyone) --- */}
          <Route path="/" element={<TenantHome />} />
          <Route path="/admin-test" element={<AdminTestManager />} />
          <Route path="/courses" element={<TenantCourses />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* --- PROTECTED STUDENT ROUTES --- */}
          {/* We replace 'RequireRole' with 'StudentRoute' here */}
          <Route path="/student" element={<StudentRoute />}>
            <Route element={<StudentLayout />}>
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
          </Route>

          {/* --- PROTECTED EDUCATOR ROUTES (Tenant Admin) --- */}
          <Route
            path="/educator"
            element={
              <RequireRole allow={["EDUCATOR", "ADMIN"]} redirectTo="/login">
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

          <Route path="*" element={<NotFound />} />
        </>
      ) : (
        /* =========================================================
           SCENARIO B: MAIN PLATFORM (univ.live)
           ========================================================= */
        <>
          <Route path="/" element={<Index />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />


          {/* ✅ Admin Panel */}
        <Route
          path="/admin"
          element={
            <RequireRole allow={["ADMIN"]}>
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />

          {/* Keeping your current lovable routes to avoid changing your files */}
          <Route path="tests" element={<AdminTestBank />} />
          <Route path="tests/new" element={<AdminTestForm />} />
          <Route path="tests/edit/:id" element={<AdminTestForm />} />
          <Route path="questions/:testId" element={<AdminQuestions />} />
        </Route>

          {/* Main Platform Educator Dashboard */}
          <Route
            path="/educator"
            element={
              <RequireRole allow={["EDUCATOR", "ADMIN"]} redirectTo="/login">
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

          <Route path="*" element={<NotFound />} />
        </>
      )}
    </Routes>
  );
}

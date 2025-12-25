import { useEffect, useMemo, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  FileText,
  History,
  Trophy,
  BarChart3,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Moon,
  Sun,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

import { useAuth } from "@/contexts/AuthProvider";
import { useTenant } from "@/contexts/TenantProvider";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";

type UserDoc = {
  displayName?: string;
  name?: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  avatar?: string;
  batch?: string;
  batchName?: string;
  coachingName?: string;
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function safeStr(v: any, fallback = "") {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

export default function StudentLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, loading: tenantLoading } = useTenant();

  const uid = firebaseUser?.uid || null;
  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [unreadThreadsCount, setUnreadThreadsCount] = useState(0);

  // Live user profile from users/{uid}
  useEffect(() => {
    if (!uid) {
      setUserDoc(null);
      return;
    }

    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.exists() ? (snap.data() as UserDoc) : null) as UserDoc | null;
        setUserDoc(data);
      },
      (err) => {
        console.error(err);
        setUserDoc(null);
      }
    );

    return () => unsub();
  }, [uid]);

  // Live unread badge for messages (count threads with unreadCountStudent > 0)
  useEffect(() => {
    if (!uid || !educatorId) {
      setUnreadThreadsCount(0);
      return;
    }

    const qUnread = query(
      collection(db, "support_threads"),
      where("studentId", "==", uid),
      where("educatorId", "==", educatorId),
      where("unreadCountStudent", ">", 0)
    );

    const unsub = onSnapshot(
      qUnread,
      (snap) => {
        setUnreadThreadsCount(snap.size);
      },
      (err) => {
        console.error(err);
        setUnreadThreadsCount(0);
      }
    );

    return () => unsub();
  }, [uid, educatorId]);

  const displayName = useMemo(() => {
    return (
      safeStr(userDoc?.displayName) ||
      safeStr(userDoc?.name) ||
      safeStr(profile?.displayName) ||
      safeStr(firebaseUser?.displayName) ||
      "Student"
    );
  }, [userDoc, profile, firebaseUser]);

  const firstName = useMemo(() => displayName.split(" ")[0] || "Student", [displayName]);

  const displayEmail = useMemo(() => {
    return (
      safeStr(firebaseUser?.email) ||
      safeStr(userDoc?.email) ||
      safeStr(profile?.email) ||
      "—"
    );
  }, [firebaseUser, userDoc, profile]);

  const avatarUrl = useMemo(() => {
    return (
      safeStr(userDoc?.photoURL) ||
      safeStr(userDoc?.avatar) ||
      safeStr(firebaseUser?.photoURL) ||
      ""
    );
  }, [userDoc, firebaseUser, profile]);

  const batchLabel = useMemo(() => {
    return (
      safeStr(userDoc?.batchName) ||
      safeStr(userDoc?.batch) ||
      "Batch"
    );
  }, [userDoc, profile, tenant]);

  const sidebarItems = useMemo(
    () => [
      { icon: LayoutDashboard, label: "Dashboard", href: "/student/dashboard" },
      { icon: FileText, label: "Tests", href: "/student/tests" },
      { icon: History, label: "My Attempts", href: "/student/attempts" },
      { icon: Trophy, label: "Rankings", href: "/student/rankings" },
      { icon: BarChart3, label: "Analytics", href: "/student/analytics" },
      {
        icon: MessageSquare,
        label: "Messages",
        href: "/student/messages",
        badge: unreadThreadsCount > 0 ? unreadThreadsCount : undefined,
      },
      { icon: Settings, label: "Settings", href: "/student/settings" },
    ],
    [unreadThreadsCount]
  );

  const isActive = (href: string) => {
    if (href === "/student/tests") return location.pathname.startsWith("/student/tests");
    if (href === "/student/attempts") {
      return location.pathname.startsWith("/student/attempts") || location.pathname.startsWith("/student/results");
    }
    return location.pathname === href;
  };

  const handleLogout = async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
      navigate("/login"); // adjust if your route differs
    } catch (e) {
      console.error(e);
    }
  };

  if (authLoading || tenantLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  // Root fixed height + overflow hidden => only main scrolls
  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar: sticky + no scroll */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-64 bg-card border-r border-border transition-transform duration-300 lg:translate-x-0 lg:static",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-border shrink-0">
            <Link to="/" className="flex items-center gap-2">
              <img src={logo} alt="UNIV.LIVE" className="h-8 w-auto" />
              <span className="font-display font-bold text-lg">
                <span className="gradient-text">UNIV</span>
                <span className="text-foreground">.LIVE</span>
              </span>
            </Link>

            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Student Info */}
          <div className="p-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-pastel-mint">
              <Avatar className="h-10 w-10 border-2 border-primary/20">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback>{initials(displayName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{batchLabel}</p>
              </div>
            </div>
          </div>

          {/* Navigation (no scroll) */}
          <nav className="p-4 space-y-1 shrink-0">
            {sidebarItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                    active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="studentActiveTab"
                      className="absolute inset-0 gradient-bg rounded-xl"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <item.icon className={cn("h-5 w-5 relative z-10", active && "text-white")} />
                  <span className="relative z-10">{item.label}</span>
                  {item.badge != null && (
                    <Badge
                      variant="secondary"
                      className={cn("ml-auto relative z-10 text-xs", active && "bg-white/20 text-white")}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          {/* Logout */}
          <div className="p-4 border-t border-border shrink-0">
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-destructive rounded-xl"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5 mr-3" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>

            {/* Breadcrumb */}
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Student</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-foreground capitalize">
                {location.pathname.split("/").pop()?.replace("-", " ") || "Dashboard"}
              </span>
            </div>

            {/* Quick Search */}
            <div className="hidden md:flex items-center relative">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tests..."
                className="pl-9 w-64 h-9 rounded-xl bg-muted/50 border-0 focus-visible:ring-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="text-muted-foreground hover:text-foreground rounded-xl"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-xl">
                  <Bell className="h-5 w-5" />
                  {unreadThreadsCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 rounded-xl">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="flex flex-col items-start gap-1 cursor-pointer">
                  <span className="font-medium">Messages</span>
                  <span className="text-xs text-muted-foreground">
                    {unreadThreadsCount > 0 ? `You have ${unreadThreadsCount} unread conversation(s).` : "No new messages."}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 rounded-xl">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={avatarUrl} />
                    <AvatarFallback>{initials(displayName)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium">{firstName}</span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{displayName}</span>
                    <span className="text-xs font-normal text-muted-foreground">{displayEmail}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/student/settings">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* ONLY this scrolls */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto overflow-x-hidden">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}


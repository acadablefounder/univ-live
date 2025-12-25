import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Target, Trophy, TrendingUp, Play, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { StudentMetricCard } from "@/components/student/StudentMetricCard";
import { AttemptTable } from "@/components/student/AttemptTable";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthProvider";
import { useTenant } from "@/contexts/TenantProvider";
import { db } from "@/lib/firebase";

import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

type AttemptStatus = "in-progress" | "submitted";

type Attempt = {
  id: string;
  testId: string;
  testTitle: string;
  subject: string;
  status: AttemptStatus;
  score: number;
  maxScore: number;
  accuracyPct: number;
  createdAtMs: number;
  submittedAtMs?: number;
};

type UserDoc = {
  displayName?: string;
  name?: string;
  photoURL?: string;
  avatar?: string;
};

function toMillis(v: any): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return Date.now();
}

function safeNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function accuracyFrom(score: number, maxScore: number) {
  if (!maxScore || maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

function formatDateLabel(ms: number) {
  // compact label: "25 Dec"
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export default function StudentDashboard() {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  const canLoad = useMemo(() => {
    return !authLoading && !tenantLoading && !!firebaseUser?.uid && !!educatorId;
  }, [authLoading, tenantLoading, firebaseUser?.uid, educatorId]);

  // 1) Load user profile (users/{uid}) once
  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      if (!firebaseUser?.uid) return;
      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        const data = (snap.exists() ? (snap.data() as UserDoc) : null) as any;
        if (!mounted) return;
        setUserDoc(data);
      } catch (e) {
        console.error(e);
      }
    }

    loadUser();
    return () => {
      mounted = false;
    };
  }, [firebaseUser?.uid]);

  // 2) Live attempts for this student+educator
  useEffect(() => {
    if (!canLoad) {
      setLoading(authLoading || tenantLoading);
      return;
    }

    setLoading(true);

    // latest attempts (both in-progress + submitted)
    const qAttempts = query(
      collection(db, "attempts"),
      where("studentId", "==", firebaseUser!.uid),
      where("educatorId", "==", educatorId!),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      qAttempts,
      (snap) => {
        const rows: Attempt[] = snap.docs.map((d) => {
          const a = d.data() as any;

          const score = safeNum(a?.score, 0);
          const maxScore = safeNum(a?.maxScore, 0);

          const accuracyPct =
            a?.accuracy != null
              ? (() => {
                  const n = Number(a.accuracy);
                  const pct = Number.isFinite(n) ? (n <= 1.01 ? n * 100 : n) : accuracyFrom(score, maxScore);
                  return Math.max(0, Math.min(100, Math.round(pct)));
                })()
              : accuracyFrom(score, maxScore);

          const statusRaw = String(a?.status || "submitted");
          const status: AttemptStatus = statusRaw === "in-progress" ? "in-progress" : "submitted";

          return {
            id: d.id,
            testId: String(a?.testId || a?.testSeriesId || ""),
            testTitle: String(a?.testTitle || "Test"),
            subject: String(a?.subject || "General Test"),
            status,
            score,
            maxScore,
            accuracyPct,
            createdAtMs: toMillis(a?.createdAt),
            submittedAtMs: a?.submittedAt ? toMillis(a?.submittedAt) : undefined,
          };
        });

        setAttempts(rows);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load dashboard data.");
        setAttempts([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [canLoad, authLoading, tenantLoading, firebaseUser, educatorId]);

  const firstName = useMemo(() => {
    const name =
      userDoc?.displayName ||
      userDoc?.name ||
      profile?.displayName ||
      firebaseUser?.displayName ||
      "Student";
    return name.split(" ")[0] || "Student";
  }, [userDoc, profile, firebaseUser]);

  const completedAttempts = useMemo(() => attempts.filter((a) => a.status === "submitted"), [attempts]);
  const inProgressAttempt = useMemo(() => attempts.find((a) => a.status === "in-progress") || null, [attempts]);

  // Metrics
  const avgScore = useMemo(() => {
    if (completedAttempts.length === 0) return 0;
    const sum = completedAttempts.reduce((acc, a) => acc + a.accuracyPct, 0);
    return Math.round(sum / completedAttempts.length);
  }, [completedAttempts]);

  const subjectPerformance = useMemo(() => {
    // group attempts by subject and average accuracy
    const map: Record<string, { total: number; count: number }> = {};
    for (const a of completedAttempts) {
      const key = a.subject || "General Test";
      map[key] = map[key] || { total: 0, count: 0 };
      map[key].total += a.accuracyPct;
      map[key].count += 1;
    }

    const data = Object.entries(map).map(([subject, v]) => ({
      subject,
      score: Math.round(v.total / Math.max(1, v.count)),
    }));

    // sort best first
    data.sort((x, y) => y.score - x.score);
    return data;
  }, [completedAttempts]);

  const bestSubject = useMemo(() => {
    if (subjectPerformance.length === 0) return { subject: "—", score: 0 };
    return subjectPerformance[0];
  }, [subjectPerformance]);

  const scoreTrend = useMemo(() => {
    // last 8 completed attempts in chronological order
    const list = [...completedAttempts]
      .sort((a, b) => (a.submittedAtMs || a.createdAtMs) - (b.submittedAtMs || b.createdAtMs))
      .slice(-8);

    return list.map((a) => ({
      date: formatDateLabel(a.submittedAtMs || a.createdAtMs),
      score: a.accuracyPct,
    }));
  }, [completedAttempts]);

  // Rank (simple: compare total score among all submitted attempts for this educator)
  // NOTE: This is “best-effort” rank using attempts collection.
  // For true batch rank, we should build a leaderboard collection updated on submit.
  const [rank, setRank] = useState<number | null>(null);
  useEffect(() => {
    if (!canLoad) return;

    // lightweight rank: find top scores of latest attempts (not perfect but works)
    const qTop = query(
      collection(db, "attempts"),
      where("educatorId", "==", educatorId!),
      where("status", "==", "submitted"),
      orderBy("score", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(
      qTop,
      (snap) => {
        const scores: Array<{ studentId: string; score: number }> = snap.docs.map((d) => {
          const a = d.data() as any;
          return { studentId: String(a?.studentId || ""), score: safeNum(a?.score, 0) };
        });

        // compute best score per student
        const best: Record<string, number> = {};
        for (const s of scores) {
          if (!s.studentId) continue;
          best[s.studentId] = Math.max(best[s.studentId] || 0, s.score);
        }

        const sorted = Object.entries(best)
          .sort((a, b) => b[1] - a[1])
          .map(([studentId]) => studentId);

        const idx = sorted.findIndex((id) => id === firebaseUser!.uid);
        setRank(idx >= 0 ? idx + 1 : null);
      },
      (err) => {
        console.error(err);
        setRank(null);
      }
    );

    return () => unsub();
  }, [canLoad, educatorId, firebaseUser]);

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <Card className="card-soft border-0 bg-gradient-to-r from-pastel-mint to-pastel-lavender overflow-hidden">
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome back, {firstName}!</h1>
            <p className="text-muted-foreground mt-1">Keep up the great work. You're making progress!</p>
          </div>
          <Button className="gradient-bg rounded-xl" asChild>
            <Link to="/student/tests">
              <Play className="h-4 w-4 mr-2" />
              Start a Test
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StudentMetricCard
          title="Tests Attempted"
          value={completedAttempts.length}
          icon={FileText}
          color="mint"
          trend={{ value: Math.min(99, completedAttempts.length * 3), isPositive: true }}
        />
        <StudentMetricCard
          title="Avg Score"
          value={`${avgScore}%`}
          icon={Target}
          color="yellow"
          trend={{ value: Math.min(99, Math.floor(avgScore / 10)), isPositive: true }}
        />
        <StudentMetricCard
          title="Best Subject"
          value={bestSubject.subject}
          subtitle={`${bestSubject.score}% avg`}
          icon={Trophy}
          color="lavender"
        />
        <StudentMetricCard
          title="Current Rank"
          value={rank ? `#${rank}` : "—"}
          subtitle="in your coaching"
          icon={TrendingUp}
          color="peach"
        />
      </div>

      {/* Continue Test */}
      {inProgressAttempt && (
        <Card className="card-soft border-0 bg-pastel-yellow">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Continue where you left off</p>
              <p className="font-semibold">{inProgressAttempt.testTitle}</p>
            </div>
            <Button className="gradient-bg rounded-xl" asChild>
              <Link to={`/student/tests/${inProgressAttempt.testId}/attempt`}>Continue Test</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="card-soft border-0">
          <CardHeader>
            <CardTitle className="text-lg">Score Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis domain={[0, 100]} className="text-xs" />
                <Tooltip contentStyle={{ borderRadius: "12px" }} />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="card-soft border-0">
          <CardHeader>
            <CardTitle className="text-lg">Subject Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={subjectPerformance}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="subject" className="text-xs" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} className="text-xs" />
                <Tooltip contentStyle={{ borderRadius: "12px" }} />
                <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Attempts */}
      <Card className="card-soft border-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Attempts</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/student/attempts">
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <AttemptTable attempts={completedAttempts.slice(0, 5) as any} compact />
        </CardContent>
      </Card>
    </div>
  );
}


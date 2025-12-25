import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthProvider";
import { useTenant } from "@/contexts/TenantProvider";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  Timestamp,
} from "firebase/firestore";

type AttemptDoc = {
  studentId: string;
  educatorId: string;
  status?: "in_progress" | "submitted" | "completed";

  testTitle?: string;
  subject?: string;

  score?: number;
  maxScore?: number;

  accuracy?: number; // may be 0..1 or 0..100
  timeTakenSec?: number;

  createdAt?: Timestamp | any;
  submittedAt?: Timestamp | any;
  startedAtMs?: number;
};

type ScoreTrendPoint = { date: string; score: number };
type SubjectPerfPoint = { subject: string; score: number };
type TimeOfDayPoint = { hour: string; attempts: number };

type FocusTask = { task: string; done: boolean };

const DEFAULT_WEEKLY_PLAN: FocusTask[] = [
  { task: "Take 1 timed mini-test", done: false },
  { task: "Revise weak topic (30 mins)", done: false },
  { task: "Practice 20 MCQs", done: false },
  { task: "Review mistakes from last attempt", done: false },
  { task: "Formula / Notes revision", done: false },
];

function toMillis(v: any): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return Date.now();
}

function percent(score: any, maxScore: any) {
  const s = Number(score ?? 0);
  const m = Number(maxScore ?? 0);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((s / m) * 100)));
}

function formatShortDate(ms: number) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function StudentAnalytics() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || null;

  const [loading, setLoading] = useState(true);

  const [scoreTrend, setScoreTrend] = useState<ScoreTrendPoint[]>([]);
  const [subjectPerformance, setSubjectPerformance] = useState<SubjectPerfPoint[]>([]);
  const [timeOfDayData, setTimeOfDayData] = useState<TimeOfDayPoint[]>([]);
  const [weeklyFocusPlan, setWeeklyFocusPlan] = useState<FocusTask[]>(DEFAULT_WEEKLY_PLAN);

  const planDocId = useMemo(() => {
    if (!firebaseUser?.uid || !educatorId) return null;
    return `${firebaseUser.uid}__${educatorId}`;
  }, [firebaseUser?.uid, educatorId]);

  // Load Weekly Focus Plan (Firestore)
  useEffect(() => {
    let mounted = true;

    async function loadPlan() {
      if (authLoading || tenantLoading) return;
      if (!firebaseUser?.uid || !educatorId || !planDocId) return;

      try {
        const ref = doc(db, "student_focus_plans", planDocId);
        const snap = await getDoc(ref);

        if (!mounted) return;

        if (snap.exists()) {
          const data = snap.data() as any;
          const arr = Array.isArray(data.weeklyFocusPlan) ? data.weeklyFocusPlan : null;
          if (arr && arr.length) setWeeklyFocusPlan(arr);
        } else {
          // keep default plan in UI; write happens only when user toggles
          setWeeklyFocusPlan(DEFAULT_WEEKLY_PLAN);
        }
      } catch (e) {
        console.error(e);
        // keep default plan
      }
    }

    loadPlan();
    return () => {
      mounted = false;
    };
  }, [authLoading, tenantLoading, firebaseUser?.uid, educatorId, planDocId]);

  // Load attempts -> build analytics
  useEffect(() => {
    if (authLoading || tenantLoading) {
      setLoading(true);
      return;
    }
    if (!firebaseUser?.uid || !educatorId) {
      setLoading(false);
      setScoreTrend([]);
      setSubjectPerformance([]);
      setTimeOfDayData([]);
      return;
    }

    setLoading(true);

    // Only submitted/completed attempts should count for analytics
    const q = query(
      collection(db, "attempts"),
      where("studentId", "==", firebaseUser.uid),
      where("educatorId", "==", educatorId),
      where("status", "==", "submitted"),
      orderBy("submittedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: AttemptDoc[] = snap.docs.map((d) => d.data() as AttemptDoc);

        // Score Trend: last 12 (reverse to show oldest -> newest)
        const trend = docs
          .slice(0, 12)
          .map((a) => {
            const ms = toMillis(a.submittedAt || a.createdAt || Date.now());
            return { date: formatShortDate(ms), score: percent(a.score, a.maxScore) };
          })
          .reverse();

        // Subject Performance: avg % by subject (top 8 subjects)
        const bySub: Record<string, { total: number; count: number }> = {};
        for (const a of docs) {
          const subj = (a.subject || "General").trim() || "General";
          const p = percent(a.score, a.maxScore);
          bySub[subj] = bySub[subj] || { total: 0, count: 0 };
          bySub[subj].total += p;
          bySub[subj].count += 1;
        }
        const subPerf = Object.entries(bySub)
          .map(([subject, v]) => ({ subject, score: Math.round(v.total / Math.max(1, v.count)) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);

        // Time of day: counts per hour (0..23) based on submittedAt/createdAt
        const hourCounts = new Array(24).fill(0);
        for (const a of docs) {
          const ms = toMillis(a.submittedAt || a.createdAt || Date.now());
          const h = new Date(ms).getHours();
          hourCounts[h] += 1;
        }
        const timeData: TimeOfDayPoint[] = hourCounts.map((cnt, h) => ({
          hour: `${h}:00`,
          attempts: cnt,
        }));

        setScoreTrend(trend);
        setSubjectPerformance(subPerf);
        setTimeOfDayData(timeData);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setScoreTrend([]);
        setSubjectPerformance([]);
        setTimeOfDayData([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [authLoading, tenantLoading, firebaseUser?.uid, educatorId]);

  const toggleTask = async (idx: number, checked: boolean) => {
    if (!firebaseUser?.uid || !educatorId || !planDocId) return;

    const next = weeklyFocusPlan.map((t, i) => (i === idx ? { ...t, done: checked } : t));
    setWeeklyFocusPlan(next);

    try {
      const ref = doc(db, "student_focus_plans", planDocId);
      await setDoc(
        ref,
        {
          studentId: firebaseUser.uid,
          educatorId,
          weeklyFocusPlan: next,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error(e);
      toast.error("Failed to save focus plan");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Track your preparation progress</p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border p-6 text-muted-foreground">Loading analytics…</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="card-soft border-0">
            <CardHeader>
              <CardTitle>Score Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={scoreTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
              {scoreTrend.length === 0 && <div className="text-sm text-muted-foreground mt-2">No attempts yet.</div>}
            </CardContent>
          </Card>

          <Card className="card-soft border-0">
            <CardHeader>
              <CardTitle>Subject Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={subjectPerformance}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="subject" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {subjectPerformance.length === 0 && (
                <div className="text-sm text-muted-foreground mt-2">No subject data yet.</div>
              )}
            </CardContent>
          </Card>

          <Card className="card-soft border-0">
            <CardHeader>
              <CardTitle>Study Hours Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={timeOfDayData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="attempts" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {timeOfDayData.every((x) => x.attempts === 0) && (
                <div className="text-sm text-muted-foreground mt-2">No attempts yet.</div>
              )}
            </CardContent>
          </Card>

          <Card className="card-soft border-0 bg-pastel-mint">
            <CardHeader>
              <CardTitle>Weekly Focus Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {weeklyFocusPlan.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-background/60">
                  <Checkbox checked={item.done} onCheckedChange={(v) => toggleTask(i, v === true)} />
                  <span className={item.done ? "line-through text-muted-foreground" : ""}>{item.task}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">
                This plan is saved to your account and will remain the same next time you login.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}


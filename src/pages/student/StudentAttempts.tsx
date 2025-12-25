import { useEffect, useMemo, useState } from "react";
import { AttemptTable } from "@/components/student/AttemptTable";
import { Attempt } from "@/mock/studentMock";
import { useAuth } from "@/contexts/AuthProvider";
import { useTenant } from "@/contexts/TenantProvider";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

type AttemptDoc = {
  testId: string;
  testTitle?: string;
  subject?: string;

  // our backend fields from StudentCBTAttempt.tsx
  status?: "in_progress" | "submitted" | "completed" | "expired" | "in-progress" | "completed";
  createdAt?: Timestamp | { seconds: number } | number | string;
  startedAtMs?: number;
  durationSec?: number;

  score?: number;
  maxScore?: number;
  accuracy?: number; // may be 0-1 OR 0-100 depending on earlier writes
  timeTakenSec?: number;

  rank?: number;
  totalParticipants?: number;

  sectionScores?: { sectionName: string; score: number; maxScore: number }[];
  aiReviewStatus?: "queued" | "in-progress" | "completed" | "failed";
};

function toMillis(v: any): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : Date.now();
  }
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return Date.now();
}

function normalizeAccuracyPercent(val: any): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  // If stored as 0..1, convert to percentage
  const pct = n <= 1.01 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function mapStatus(docStatus: any, startedAtMs: number | undefined, durationSec: number | undefined) {
  // AttemptTable expects: 'completed' | 'in-progress' | 'expired'
  const s = String(docStatus || "").toLowerCase();

  const expired =
    !!startedAtMs &&
    !!durationSec &&
    Date.now() > startedAtMs + durationSec * 1000;

  if (s === "submitted" || s === "completed" || s === "complete") return "completed" as const;
  if (s === "expired") return "expired" as const;

  // in progress variants
  if (expired) return "expired" as const;
  return "in-progress" as const;
}

export default function StudentAttempts() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || null;

  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  const canLoad = useMemo(() => {
    return !authLoading && !tenantLoading && !!firebaseUser?.uid && !!educatorId;
  }, [authLoading, tenantLoading, firebaseUser, educatorId]);

  useEffect(() => {
    if (!canLoad) {
      setLoading(authLoading || tenantLoading);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "attempts"),
      where("studentId", "==", firebaseUser!.uid),
      where("educatorId", "==", educatorId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Attempt[] = snap.docs.map((d) => {
          const data = d.data() as AttemptDoc;

          const createdAtMs = toMillis(data.createdAt);
          const startedAtMs = typeof data.startedAtMs === "number" ? data.startedAtMs : undefined;
          const durationSec = typeof data.durationSec === "number" ? data.durationSec : undefined;

          const status = mapStatus(data.status, startedAtMs, durationSec);

          return {
            id: d.id,
            testId: String(data.testId || ""),
            testTitle: String(data.testTitle || "Untitled Test"),
            subject: String(data.subject || "General"),

            score: Number(data.score ?? 0),
            maxScore: Number(data.maxScore ?? 0),

            accuracy: normalizeAccuracyPercent(data.accuracy),

            // AttemptTable expects seconds
            timeSpent: Number(data.timeTakenSec ?? 0),

            // Ranking not implemented yet — keep as 0 so UI shows "—"
            rank: Number(data.rank ?? 0),
            totalParticipants: Number(data.totalParticipants ?? 0),

            status,

            createdAt: new Date(createdAtMs).toISOString(),
            completedAt: status === "completed" ? new Date(createdAtMs).toISOString() : undefined,

            sectionScores: Array.isArray(data.sectionScores) ? data.sectionScores : [],
            aiReviewStatus: data.aiReviewStatus ?? "queued",
          };
        });

        setAttempts(rows);
        setLoading(false);
      },
      () => {
        // If permission/index error occurs, we avoid crashing UI
        setAttempts([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [canLoad, firebaseUser, educatorId, authLoading, tenantLoading, tenantSlug]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Attempts</h1>
          <p className="text-muted-foreground">Review all your test attempts and performance</p>
        </div>
        <div className="rounded-xl border border-border p-6 text-muted-foreground">
          Loading attempts…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Attempts</h1>
        <p className="text-muted-foreground">Review all your test attempts and performance</p>
      </div>

      {attempts.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-muted-foreground">
          No attempts found yet. Start a test to see your attempts here.
        </div>
      ) : (
        <AttemptTable attempts={attempts} />
      )}
    </div>
  );
}


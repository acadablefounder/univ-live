import { useEffect, useMemo, useState } from "react";
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { useAuth } from "@/contexts/AuthProvider";
import { useTenant } from "@/contexts/TenantProvider";
import { db } from "@/lib/firebase";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

type LeaderboardRow = {
  studentId: string;
  name: string;
  avatar?: string;
  rank: number;
  score: number; // points
  accuracy: number; // percent
  rankChange: number;
  isCurrentUser: boolean;
};

type AttemptDoc = {
  studentId: string;
  educatorId: string;
  tenantSlug?: string | null;
  status?: "in_progress" | "submitted";

  score?: number;
  maxScore?: number;
  accuracy?: number; // 0..1 or 0..100
  timeTakenSec?: number;

  submittedAt?: any;
};

type UserProfileDoc = {
  displayName?: string;
  name?: string;
  photoURL?: string;
  avatar?: string;
};

function safeNumber(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pct(score: number, maxScore: number) {
  if (!maxScore || maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

function normalizeAccuracyPercent(val: any) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  const pctVal = n <= 1.01 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pctVal)));
}

function fallbackName(uid: string) {
  const tail = uid.slice(-4).toUpperCase();
  return `Student ${tail}`;
}

function windowRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(now) };
}

function previousWindowRange(days: number) {
  const now = new Date();
  const end = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) };
}

function pickBestAttemptsPerStudent(attempts: AttemptDoc[]) {
  // Best attempt per student within window (by percent desc, then score desc, then time asc)
  const best: Record<string, AttemptDoc> = {};

  for (const a of attempts) {
    const uid = a.studentId;
    if (!uid) continue;

    const score = safeNumber(a.score, 0);
    const maxScore = safeNumber(a.maxScore, 0);
    const percentScore = pct(score, maxScore);
    const time = safeNumber(a.timeTakenSec, Number.MAX_SAFE_INTEGER);

    const current = best[uid];
    if (!current) {
      best[uid] = a;
      continue;
    }

    const cScore = safeNumber(current.score, 0);
    const cMax = safeNumber(current.maxScore, 0);
    const cPercent = pct(cScore, cMax);
    const cTime = safeNumber(current.timeTakenSec, Number.MAX_SAFE_INTEGER);

    if (percentScore > cPercent) best[uid] = a;
    else if (percentScore === cPercent && score > cScore) best[uid] = a;
    else if (percentScore === cPercent && score === cScore && time < cTime) best[uid] = a;
  }

  return Object.entries(best).map(([studentId, attempt]) => ({ studentId, attempt }));
}

async function hydrateProfiles(studentIds: string[]) {
  const result: Record<string, { name: string; avatar?: string }> = {};
  await Promise.all(
    studentIds.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          const d = snap.data() as UserProfileDoc;
          const name = (d.displayName || d.name || "").trim() || fallbackName(uid);
          const avatar = (d.photoURL || d.avatar || "").trim() || undefined;
          result[uid] = { name, avatar };
        } else {
          result[uid] = { name: fallbackName(uid) };
        }
      } catch {
        result[uid] = { name: fallbackName(uid) };
      }
    })
  );
  return result;
}

export default function StudentRankings() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || null;

  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [prevRankMap, setPrevRankMap] = useState<Record<string, number>>({});

  const canLoad = useMemo(() => {
    return !authLoading && !tenantLoading && !!firebaseUser?.uid && !!educatorId;
  }, [authLoading, tenantLoading, firebaseUser?.uid, educatorId]);

  // Load previous window ranks (for rankChange)
  useEffect(() => {
    let mounted = true;

    async function loadPrev() {
      if (!canLoad) return;

      try {
        const DAYS = 30;
        const prev = previousWindowRange(DAYS);

        const base = [
          where("educatorId", "==", educatorId),
          where("status", "==", "submitted"),
          where("submittedAt", ">=", prev.start),
          where("submittedAt", "<", prev.end),
        ];

        // Tenant-specific leaderboard (batch)
        if (tenantSlug) base.push(where("tenantSlug", "==", tenantSlug));

        const qPrev = query(
          collection(db, "attempts"),
          ...base,
          // We order by score to pull top attempts with fewer reads; we still aggregate per student
          orderBy("score", "desc"),
          orderBy("timeTakenSec", "asc"),
          limit(600)
        );

        const snap = await getDocs(qPrev);
        const attempts = snap.docs.map((d) => d.data() as AttemptDoc);

        const best = pickBestAttemptsPerStudent(attempts)
          .map(({ studentId, attempt }) => {
            const score = safeNumber(attempt.score, 0);
            const maxScore = safeNumber(attempt.maxScore, 0);
            const percentScore = pct(score, maxScore);
            const time = safeNumber(attempt.timeTakenSec, Number.MAX_SAFE_INTEGER);
            return { studentId, percentScore, score, time, attempt };
          })
          .sort((a, b) => {
            if (b.percentScore !== a.percentScore) return b.percentScore - a.percentScore;
            if (b.score !== a.score) return b.score - a.score;
            return a.time - b.time;
          });

        const map: Record<string, number> = {};
        best.forEach((row, idx) => (map[row.studentId] = idx + 1));

        if (!mounted) return;
        setPrevRankMap(map);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setPrevRankMap({});
      }
    }

    loadPrev();
    return () => {
      mounted = false;
    };
  }, [canLoad, educatorId, tenantSlug]);

  // Live leaderboard (current window)
  useEffect(() => {
    if (!canLoad) {
      setLoading(authLoading || tenantLoading);
      return;
    }

    setLoading(true);

    const DAYS = 30;
    const cur = windowRange(DAYS);

    const constraints: any[] = [
      where("educatorId", "==", educatorId),
      where("status", "==", "submitted"),
      where("submittedAt", ">=", cur.start),
      orderBy("score", "desc"),
      orderBy("timeTakenSec", "asc"),
      limit(600),
    ];

    if (tenantSlug) constraints.splice(2, 0, where("tenantSlug", "==", tenantSlug)); // insert after educatorId/status

    const qCur = query(collection(db, "attempts"), ...constraints);

    const unsub = onSnapshot(
      qCur,
      async (snap) => {
        try {
          const attempts = snap.docs.map((d) => d.data() as AttemptDoc);

          // Aggregate: best attempt per student
          const best = pickBestAttemptsPerStudent(attempts)
            .map(({ studentId, attempt }) => {
              const score = safeNumber(attempt.score, 0);
              const maxScore = safeNumber(attempt.maxScore, 0);
              const percentScore = pct(score, maxScore);
              const time = safeNumber(attempt.timeTakenSec, Number.MAX_SAFE_INTEGER);
              const accuracy = attempt.accuracy != null ? normalizeAccuracyPercent(attempt.accuracy) : percentScore;
              return { studentId, percentScore, score, maxScore, time, accuracy };
            })
            .sort((a, b) => {
              if (b.percentScore !== a.percentScore) return b.percentScore - a.percentScore;
              if (b.score !== a.score) return b.score - a.score;
              return a.time - b.time;
            });

          const top = best.slice(0, 50); // keep UI fast + fewer profile reads
          const ids = top.map((x) => x.studentId);

          const profiles = await hydrateProfiles(ids);

          const rows: LeaderboardRow[] = top.map((x, idx) => {
            const rank = idx + 1;
            const prevRank = prevRankMap[x.studentId];
            const rankChange = prevRank ? prevRank - rank : 0; // + means improved
            const name = profiles[x.studentId]?.name || fallbackName(x.studentId);
            const avatar = profiles[x.studentId]?.avatar;
            return {
              studentId: x.studentId,
              name,
              avatar,
              rank,
              score: x.score,
              accuracy: x.accuracy,
              rankChange,
              isCurrentUser: x.studentId === firebaseUser!.uid,
            };
          });

          setLeaderboard(rows);
          setLoading(false);
        } catch (e) {
          console.error(e);
          setLeaderboard([]);
          setLoading(false);
        }
      },
      (err) => {
        console.error(err);
        setLeaderboard([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [canLoad, educatorId, tenantSlug, firebaseUser, authLoading, tenantLoading, prevRankMap]);

  const top3 = leaderboard.slice(0, 3);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Rankings</h1>
          <p className="text-muted-foreground">See how you compare with others in your batch</p>
        </div>
        <div className="rounded-xl border border-border p-6 text-muted-foreground">Loading leaderboard…</div>
      </div>
    );
  }

  if (!firebaseUser?.uid || !educatorId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Rankings</h1>
          <p className="text-muted-foreground">See how you compare with others in your batch</p>
        </div>
        <div className="rounded-xl border border-border p-6 text-muted-foreground">
          Open rankings from your coaching website (tenant) and make sure you are logged in.
        </div>
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Rankings</h1>
          <p className="text-muted-foreground">See how you compare with others in your batch</p>
        </div>
        <div className="rounded-xl border border-border p-6 text-muted-foreground">
          No leaderboard yet. Submit at least one test attempt to appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rankings</h1>
        <p className="text-muted-foreground">See how you compare with others in your batch</p>
      </div>

      {/* Top 3 */}
      <div className="grid grid-cols-3 gap-4">
        {top3.map((entry, i) => (
          <Card
            key={entry.studentId}
            className={cn(
              "card-soft border-0 text-center",
              i === 0
                ? "bg-yellow-100 dark:bg-yellow-900/20"
                : i === 1
                ? "bg-gray-100 dark:bg-gray-800"
                : "bg-orange-100 dark:bg-orange-900/20"
            )}
          >
            <CardContent className="pt-6">
              <div className="relative inline-block">
                <Avatar className="h-16 w-16 border-4 border-white shadow-lg">
                  <AvatarImage src={entry.avatar} />
                  <AvatarFallback>{entry.name?.[0] || "S"}</AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                    i === 0 ? "bg-yellow-400" : i === 1 ? "bg-gray-400" : "bg-orange-400"
                  )}
                >
                  {entry.rank}
                </div>
              </div>
              <p className="font-semibold mt-3">{entry.name}</p>
              <p className="text-2xl font-bold gradient-text">{entry.score}</p>
              <p className="text-xs text-muted-foreground">{entry.accuracy}% accuracy</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Full Leaderboard */}
      <Card className="card-soft border-0">
        <CardHeader>
          <CardTitle>Full Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="text-center">Accuracy</TableHead>
                <TableHead className="text-center">Change</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {leaderboard.map((entry) => (
                <TableRow key={entry.studentId} className={cn(entry.isCurrentUser && "bg-primary/5")}>
                  <TableCell className="font-bold">
                    {entry.rank <= 3 ? (
                      <Trophy
                        className={cn(
                          "h-5 w-5",
                          entry.rank === 1 ? "text-yellow-500" : entry.rank === 2 ? "text-gray-400" : "text-orange-400"
                        )}
                      />
                    ) : (
                      `#${entry.rank}`
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={entry.avatar} />
                        <AvatarFallback>{entry.name?.[0] || "S"}</AvatarFallback>
                      </Avatar>

                      <span className={cn("font-medium", entry.isCurrentUser && "text-primary")}>
                        {entry.name}
                        {entry.isCurrentUser && " (You)"}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="text-center font-semibold">{entry.score}</TableCell>
                  <TableCell className="text-center">{entry.accuracy}%</TableCell>

                  <TableCell className="text-center">
                    {entry.rankChange > 0 ? (
                      <span className="text-green-600 flex items-center justify-center gap-1">
                        <TrendingUp className="h-4 w-4" />+{entry.rankChange}
                      </span>
                    ) : entry.rankChange < 0 ? (
                      <span className="text-red-500 flex items-center justify-center gap-1">
                        <TrendingDown className="h-4 w-4" />
                        {entry.rankChange}
                      </span>
                    ) : (
                      <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground mt-3">
            Leaderboard is based on each student’s best submitted attempt in the last 30 days.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}


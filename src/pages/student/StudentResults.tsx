import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Trophy, Target, Clock, TrendingUp, Eye } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AIReviewPanel } from "@/components/student/AIReviewPanel";

import { useAuth } from "@/contexts/AuthProvider";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

type AttemptResponse = {
  answer: string | null;
  markedForReview: boolean;
  visited: boolean;
  answered: boolean;
};

type AttemptDoc = {
  studentId: string;
  educatorId: string;
  tenantSlug?: string | null;

  testId: string;
  testTitle?: string;
  subject?: string;

  status?: "in_progress" | "submitted";

  durationSec?: number;
  startedAtMs?: number;
  timeTakenSec?: number;

  score?: number;
  maxScore?: number;
  accuracy?: number; // may be 0..1 or 0..100

  responses?: Record<string, AttemptResponse>;

  // optional (if you add later)
  aiReviewStatus?: "queued" | "in-progress" | "completed" | "failed";
  aiReview?: any;

  // optional (if you add later)
  rank?: number;
  totalParticipants?: number;
};

type QuestionDoc = {
  sectionId?: string;
  type?: "mcq" | "integer";
  text?: string;
  options?: string[];
  correctOptionIndex?: number;
  correctAnswer?: string | number;
  explanation?: string;
  positiveMarks?: number;
  negativeMarks?: number;
};

type TestDoc = {
  title?: string;
  subject?: string;
  durationMinutes?: number;
  sections?: { id: string; name: string }[];
};

type SectionScore = { sectionName: string; score: number; maxScore: number };

function safeNumber(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAccuracyPercent(val: any, fallback = 0) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  const pct = n <= 1.01 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  return `${mins} min`;
}

function isAnswered(val: any) {
  return val !== null && val !== undefined && String(val).trim() !== "";
}

function computeFromQuestionsAndResponses(
  questions: { id: string; data: QuestionDoc }[],
  responses: Record<string, AttemptResponse>,
  sectionNameById: Record<string, string>
) {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;

  const perSection: Record<string, { score: number; maxScore: number }> = {};

  for (const q of questions) {
    const d = q.data;
    const sectionId = d.sectionId || "main";
    const pos = safeNumber(d.positiveMarks, 4);
    const neg = Math.abs(safeNumber(d.negativeMarks, 1));

    maxScore += pos;
    perSection[sectionId] = perSection[sectionId] || { score: 0, maxScore: 0 };
    perSection[sectionId].maxScore += pos;

    const userAnswer = responses[q.id]?.answer ?? null;

    if (!isAnswered(userAnswer)) continue;

    const type = d.type === "integer" ? "integer" : "mcq";
    let isCorrect = false;

    if (type === "integer") {
      isCorrect = String(userAnswer).trim() === String(d.correctAnswer ?? "").trim();
    } else {
      isCorrect = String(userAnswer) === String(safeNumber(d.correctOptionIndex, 0));
    }

    if (isCorrect) {
      score += pos;
      perSection[sectionId].score += pos;
      correctCount += 1;
    } else {
      score -= neg;
      perSection[sectionId].score -= neg;
      incorrectCount += 1;
    }
  }

  const attempted = correctCount + incorrectCount;
  const accuracyPct = attempted > 0 ? Math.round((correctCount / attempted) * 100) : 0;

  const sectionScores: SectionScore[] = Object.keys(perSection).map((sid) => ({
    sectionName: sectionNameById[sid] || sid,
    score: perSection[sid].score,
    maxScore: perSection[sid].maxScore,
  }));

  return { score, maxScore, accuracyPct, sectionScores };
}

export default function StudentResults() {
  const { attemptId } = useParams();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<AttemptDoc | null>(null);
  const [sectionScores, setSectionScores] = useState<SectionScore[]>([]);
  const [computedScore, setComputedScore] = useState<number | null>(null);
  const [computedMaxScore, setComputedMaxScore] = useState<number | null>(null);
  const [computedAccuracyPct, setComputedAccuracyPct] = useState<number | null>(null);

  const rank = attempt?.rank ?? 0;
  const totalParticipants = attempt?.totalParticipants ?? 0;

  const percentileText = useMemo(() => {
    if (!rank || !totalParticipants) return "—";
    const top = Math.round((rank / totalParticipants) * 100);
    return `Top ${top}%`;
  }, [rank, totalParticipants]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!attemptId) {
        setError("Missing attempt id");
        setLoading(false);
        return;
      }
      if (authLoading) return;
      if (!firebaseUser) {
        setError("Please login to view your results.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 1) Attempt
        const aSnap = await getDoc(doc(db, "attempts", attemptId));
        if (!aSnap.exists()) throw new Error("Attempt not found.");

        const a = aSnap.data() as AttemptDoc;

        // student can only view their own attempt
        if (a.studentId !== firebaseUser.uid) throw new Error("You don't have permission to view this attempt.");

        if (!a.educatorId || !a.testId) throw new Error("Attempt is missing test reference.");

        // 2) Load test + questions (educator test first, fallback)
        const sources = [
          {
            testDoc: doc(db, "educators", a.educatorId, "my_tests", a.testId),
            qCol: collection(db, "educators", a.educatorId, "my_tests", a.testId, "questions"),
          },
          {
            testDoc: doc(db, "test_series", a.testId),
            qCol: collection(db, "test_series", a.testId, "questions"),
          },
        ];

        let testData: TestDoc | null = null;
        let qs: { id: string; data: QuestionDoc }[] = [];

        for (const s of sources) {
          const tSnap = await getDoc(s.testDoc);
          if (!tSnap.exists()) continue;

          testData = tSnap.data() as TestDoc;
          const qSnap = await getDocs(s.qCol);
          qs = qSnap.docs.map((d) => ({ id: d.id, data: d.data() as QuestionDoc }));
          break;
        }

        if (!testData) throw new Error("Test not found for this attempt.");
        if (!qs.length) throw new Error("Questions not found for this attempt.");

        // Build section name mapping
        const sectionNameById: Record<string, string> = {};
        if (Array.isArray(testData.sections) && testData.sections.length) {
          testData.sections.forEach((s) => (sectionNameById[s.id] = s.name));
        } else {
          // fallback
          sectionNameById["main"] = testData.subject || "General";
        }

        const resp = a.responses || {};
        const derived = computeFromQuestionsAndResponses(qs, resp, sectionNameById);

        if (!mounted) return;

        // prefer stored values when present, otherwise computed
        setAttempt({
          ...a,
          testTitle: a.testTitle || testData.title || "Untitled Test",
          subject: a.subject || testData.subject || "General",
        });

        setSectionScores(derived.sectionScores);

        setComputedScore(typeof a.score === "number" ? a.score : derived.score);
        setComputedMaxScore(typeof a.maxScore === "number" ? a.maxScore : derived.maxScore);

        const storedAcc = typeof a.accuracy === "number" ? normalizeAccuracyPercent(a.accuracy) : null;
        setComputedAccuracyPct(storedAcc ?? derived.accuracyPct);
      } catch (e: any) {
        console.error(e);
        if (!mounted) return;
        setError(e?.message || "Failed to load results.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [attemptId, firebaseUser, authLoading]);

  if (loading || authLoading) return <div className="text-center py-12">Loading...</div>;
  if (error) return <div className="text-center py-12">{error}</div>;
  if (!attempt) return <div className="text-center py-12">Attempt not found.</div>;

  const score = computedScore ?? 0;
  const maxScore = computedMaxScore ?? 0;
  const accuracyPct = computedAccuracyPct ?? 0;
  const timeSpentSec = safeNumber(attempt.timeTakenSec, 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Button variant="ghost" asChild>
        <Link to="/student/attempts">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Attempts
        </Link>
      </Button>

      {/* Score Header */}
      <Card className="card-soft border-0 bg-gradient-to-r from-pastel-mint to-pastel-lavender">
        <CardContent className="p-6 text-center">
          <h1 className="text-2xl font-bold mb-2">{attempt.testTitle || "Test"}</h1>
          <div className="text-5xl font-bold gradient-text mb-2">
            {score}/{maxScore}
          </div>
          <p className="text-muted-foreground">Your Score</p>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="card-soft border-0 bg-pastel-yellow">
          <CardContent className="p-4 text-center">
            <Target className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{accuracyPct}%</p>
            <p className="text-xs text-muted-foreground">Accuracy</p>
          </CardContent>
        </Card>

        <Card className="card-soft border-0 bg-pastel-lavender">
          <CardContent className="p-4 text-center">
            <Trophy className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
            <p className="text-2xl font-bold">{rank ? `#${rank}` : "—"}</p>
            <p className="text-xs text-muted-foreground">Rank</p>
          </CardContent>
        </Card>

        <Card className="card-soft border-0 bg-pastel-peach">
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{formatTime(timeSpentSec)}</p>
            <p className="text-xs text-muted-foreground">Time Spent</p>
          </CardContent>
        </Card>

        <Card className="card-soft border-0 bg-pastel-mint">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 mx-auto mb-2 text-green-600" />
            <p className="text-2xl font-bold">{percentileText}</p>
            <p className="text-xs text-muted-foreground">Percentile</p>
          </CardContent>
        </Card>
      </div>

      {/* Section Breakdown */}
      <Card className="card-soft border-0">
        <CardHeader>
          <CardTitle>Section-wise Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sectionScores.length === 0 ? (
            <div className="text-sm text-muted-foreground">No section breakdown available.</div>
          ) : (
            sectionScores.map((section, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{section.sectionName}</span>
                  <span className="font-medium">
                    {section.score}/{section.maxScore}
                  </span>
                </div>
                <Progress value={section.maxScore ? (section.score / section.maxScore) * 100 : 0} className="h-2" />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* AI Review */}
      <AIReviewPanel status={attempt.aiReviewStatus ?? "queued"} review={attempt.aiReview} />

      {/* Actions */}
      <div className="flex gap-4">
        <Button variant="outline" className="flex-1 rounded-xl" asChild>
          <Link to={`/student/attempts/${attemptId}`}>
            <Eye className="h-4 w-4 mr-2" />
            Review Answers
          </Link>
        </Button>

        <Button className="flex-1 rounded-xl gradient-bg" asChild>
          <Link to="/student/tests">Take Another Test</Link>
        </Button>
      </div>
    </div>
  );
}


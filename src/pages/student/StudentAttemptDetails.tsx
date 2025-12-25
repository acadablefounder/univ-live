import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  responses?: Record<string, AttemptResponse>;

  score?: number;
  maxScore?: number;
};

type AttemptQuestion = {
  id: string;
  sectionId: string;
  type: "mcq" | "integer";
  stem: string;
  options?: { id: string; text: string }[];
  correctAnswer?: string; // for mcq => option index as string, for integer => exact string
  explanation?: string;
  marks: { correct: number; incorrect: number }; // incorrect as positive penalty
  passage?: { title: string; content: string } | null;
};

function safeNumber(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapQuestion(id: string, data: any): AttemptQuestion {
  const opts: string[] = Array.isArray(data.options) ? data.options : [];
  const correctIndex = safeNumber(data.correctOptionIndex, 0);

  const positive = safeNumber(data.positiveMarks, 4);
  const negative = safeNumber(data.negativeMarks, 1);

  return {
    id,
    sectionId: data.sectionId || "main",
    type: data.type === "integer" ? "integer" : "mcq",
    stem: data.text || "",
    options: opts.map((t, i) => ({ id: String(i), text: String(t) })),
    correctAnswer: data.type === "integer" ? String(data.correctAnswer ?? "") : String(correctIndex),
    explanation: data.explanation || "",
    marks: { correct: positive, incorrect: Math.abs(negative) },
    passage: data.passage || null,
  };
}

function isAnswered(val: any) {
  return val !== null && val !== undefined && String(val).trim() !== "";
}

function isCorrectAnswer(q: AttemptQuestion, userAnswer: string | null) {
  if (!isAnswered(userAnswer)) return false;
  if (q.type === "integer") return String(userAnswer).trim() === String(q.correctAnswer ?? "").trim();
  return String(userAnswer) === String(q.correctAnswer ?? "");
}

export default function StudentAttemptDetails() {
  const { attemptId } = useParams();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<AttemptDoc | null>(null);
  const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, AttemptResponse>>({});

  const title = useMemo(() => attempt?.testTitle || "Attempt Review", [attempt]);

  useEffect(() => {
    let mounted = true;

    async function loadAll() {
      if (!attemptId) {
        setError("Missing attempt id");
        setLoading(false);
        return;
      }
      if (authLoading) return;
      if (!firebaseUser) {
        setError("Please login to view your attempt.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 1) Load attempt
        const aSnap = await getDoc(doc(db, "attempts", attemptId));
        if (!aSnap.exists()) throw new Error("Attempt not found.");

        const a = aSnap.data() as AttemptDoc;

        // Security: student can only see their own attempts
        if (a.studentId !== firebaseUser.uid) throw new Error("You don't have permission to view this attempt.");

        const educatorId = a.educatorId;
        const testId = a.testId;

        if (!educatorId || !testId) throw new Error("Attempt is missing test reference.");

        // 2) Load test + questions (educator test first, fallback to global)
        const sources = [
          {
            testDoc: doc(db, "educators", educatorId, "my_tests", testId),
            qCol: collection(db, "educators", educatorId, "my_tests", testId, "questions"),
          },
          {
            testDoc: doc(db, "test_series", testId),
            qCol: collection(db, "test_series", testId, "questions"),
          },
        ];

        let qs: AttemptQuestion[] = [];
        let found = false;

        for (const s of sources) {
          const tSnap = await getDoc(s.testDoc);
          if (!tSnap.exists()) continue;

          const qSnap = await getDocs(s.qCol);
          qs = qSnap.docs.map((d) => mapQuestion(d.id, d.data()));
          found = true;
          break;
        }

        if (!found) throw new Error("Test not found for this attempt.");
        if (!qs.length) throw new Error("Questions not found for this attempt.");

        if (!mounted) return;

        setAttempt(a);
        setQuestions(qs);
        setResponses(a.responses || {});
      } catch (e: any) {
        console.error(e);
        if (!mounted) return;
        setError(e?.message || "Failed to load attempt details.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadAll();
    return () => {
      mounted = false;
    };
  }, [attemptId, firebaseUser, authLoading]);

  if (loading || authLoading) return <div className="text-center py-12">Loading...</div>;
  if (error) return <div className="text-center py-12">{error}</div>;
  if (!attempt) return <div className="text-center py-12">Attempt not found.</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Button variant="ghost" asChild>
        <Link to={`/student/results/${attemptId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Results
        </Link>
      </Button>

      <Card className="card-soft border-0 bg-pastel-lavender">
        <CardContent className="p-6">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-muted-foreground">Review your answers</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {questions.map((q, i) => {
          const userAnswer = responses[q.id]?.answer ?? null;
          const answered = isAnswered(userAnswer);
          const correct = isCorrectAnswer(q, userAnswer);

          // marks awarded:
          const awarded = !answered ? 0 : correct ? q.marks.correct : -Math.abs(q.marks.incorrect);

          return (
            <Card
              key={q.id}
              className={cn(
                "card-soft border-0",
                !answered ? "bg-slate-50 dark:bg-slate-900/10" : correct ? "bg-green-50 dark:bg-green-900/10" : "bg-red-50 dark:bg-red-900/10"
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="rounded-full">
                    Q{i + 1}
                  </Badge>

                  <div className="flex items-center gap-2">
                    {answered ? (
                      correct ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )
                    ) : (
                      <Badge className="rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        Unanswered
                      </Badge>
                    )}

                    <Badge
                      className={cn(
                        "rounded-full",
                        !answered
                          ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          : correct
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      )}
                    >
                      {!answered ? "0" : awarded > 0 ? `+${awarded}` : `${awarded}`}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {!!q.passage && (
                  <div className="p-4 bg-pastel-cream rounded-xl">
                    <p className="font-semibold mb-2">{q.passage.title}</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{q.passage.content}</p>
                  </div>
                )}

                <p className="font-medium">{q.stem}</p>

                {q.options && q.type === "mcq" && (
                  <div className="space-y-2">
                    {q.options.map((opt, j) => {
                      const isOptCorrect = opt.id === q.correctAnswer;
                      const isUser = answered && opt.id === String(userAnswer);

                      return (
                        <div
                          key={opt.id}
                          className={cn(
                            "p-3 rounded-xl border-2",
                            isOptCorrect
                              ? "border-green-500 bg-green-100/50 dark:bg-green-900/20"
                              : isUser && !isOptCorrect
                              ? "border-red-500 bg-red-100/50 dark:bg-red-900/20"
                              : "border-transparent bg-background/50"
                          )}
                        >
                          <span className="font-medium">{String.fromCharCode(65 + j)}.</span> {opt.text}

                          {isOptCorrect && <Badge className="ml-2 rounded-full bg-green-500">Correct</Badge>}
                          {isUser && !isOptCorrect && <Badge className="ml-2 rounded-full bg-red-500">Your Answer</Badge>}
                          {isUser && isOptCorrect && <Badge className="ml-2 rounded-full bg-green-500">Your Answer</Badge>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.type === "integer" && (
                  <div className="flex gap-4 flex-wrap">
                    <div className="p-3 rounded-xl bg-background/50">
                      <span className="text-muted-foreground">Your answer:</span>{" "}
                      <span className="font-bold">{answered ? userAnswer : "—"}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-green-100/50 dark:bg-green-900/20">
                      <span className="text-muted-foreground">Correct:</span>{" "}
                      <span className="font-bold text-green-600">{q.correctAnswer}</span>
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-pastel-cream">
                  <p className="text-sm font-medium mb-1">Explanation</p>
                  <p className="text-sm text-muted-foreground">{q.explanation?.trim() ? q.explanation : "No explanation available."}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


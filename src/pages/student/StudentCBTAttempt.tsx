import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Flag, ChevronLeft, ChevronRight, Save, Trash2, Maximize2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimerChip } from "@/components/student/TimerChip";
import { CBTQuestionPalette } from "@/components/student/CBTQuestionPalette";
import { cn } from "@/lib/utils";

import { useAuth } from "@/contexts/AuthProvider";
import { useTenant } from "@/contexts/TenantProvider";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

type AttemptResponse = { answer: string | null; markedForReview: boolean; visited: boolean; answered: boolean };

type AttemptQuestion = {
  id: string;
  sectionId: string;
  type: "mcq" | "integer";
  stem: string;
  options?: { id: string; text: string }[];
  correctAnswer?: string;
  explanation?: string;
  marks: { correct: number; incorrect: number };
  passage?: { title: string; content: string } | null;
};

type TestMeta = {
  id: string;
  title: string;
  subject?: string;
  durationMinutes: number;
  sections: { id: string; name: string }[];
};

type AttemptDoc = {
  studentId: string;
  educatorId: string;
  tenantSlug: string | null;
  testId: string;
  testTitle?: string;
  subject?: string;
  status: "in_progress" | "submitted";
  durationSec: number;
  startedAtMs?: number;
  currentIndex?: number;
  responses?: Record<string, AttemptResponse>;
  createdAt?: any;
  startedAt?: any;
  updatedAt?: any;
};

const LS_ATTEMPT_ID_PREFIX = "cbt_attempt_id__";

const safeNumber = (v: any, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const buildInitResponses = (qs: AttemptQuestion[]) => {
  const init: Record<string, AttemptResponse> = {};
  qs.forEach((q) => (init[q.id] = { answer: null, markedForReview: false, visited: false, answered: false }));
  return init;
};

const mapQuestion = (id: string, data: any): AttemptQuestion => {
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
    explanation: data.explanation,
    marks: { correct: positive, incorrect: negative },
    passage: data.passage || null,
  };
};

const computeRemainingSeconds = (startedAtMs: number | null, totalSec: number) => {
  if (!totalSec) return 0;
  if (!startedAtMs) return totalSec;
  const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
  return Math.max(0, totalSec - elapsed);
};

async function requestFullscreenSafe() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

async function exitFullscreenSafe() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // ignore
  }
}

export default function StudentCBTAttempt() {
  const { testId } = useParams();
  const navigate = useNavigate();

  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const { tenant, tenantSlug, loading: tenantLoading } = useTenant();

  const educatorId = tenant?.educatorId || profile?.educatorId || null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [testMeta, setTestMeta] = useState<TestMeta | null>(null);
  const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, AttemptResponse>>({});

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSectionId, setCurrentSectionId] = useState("main");

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attemptStartedAtMs, setAttemptStartedAtMs] = useState<number | null>(null);
  const [durationSec, setDurationSec] = useState(0);

  const [isStarted, setIsStarted] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(true);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [timerStartSeconds, setTimerStartSeconds] = useState(0);

  const attemptIdStorageKey = useMemo(
    () => `${LS_ATTEMPT_ID_PREFIX}${tenantSlug || "main"}__${testId || ""}`,
    [tenantSlug, testId]
  );

  const attemptRef = useMemo(() => (attemptId ? doc(db, "attempts", attemptId) : null), [attemptId]);

  // Debounced Firestore updates (reduces write spam)
  const saveTimerRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<Record<string, any>>({});

  const queueAttemptUpdate = useCallback(
    (patch: Record<string, any>) => {
      if (!attemptRef) return;

      pendingUpdateRef.current = { ...pendingUpdateRef.current, ...patch };

      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        const payload = pendingUpdateRef.current;
        pendingUpdateRef.current = {};
        setSaving(true);
        try {
          await updateDoc(attemptRef, { ...payload, updatedAt: serverTimestamp() });
          setLastSavedAt(Date.now());
        } catch (e) {
          console.error(e);
          toast.error("Failed to save progress");
        } finally {
          setSaving(false);
        }
      }, 650);
    },
    [attemptRef]
  );

  const answeredCount = useMemo(() => Object.values(responses).filter((r) => !!r?.answer).length, [responses]);
  const unansweredVisitedCount = useMemo(
    () => Object.values(responses).filter((r) => r?.visited && !r?.answer).length,
    [responses]
  );

  const currentQuestion = questions[currentIndex] || null;

  // Load test + questions + existing attempt
  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!testId) {
        setLoadError("Missing test id");
        setLoading(false);
        return;
      }
      if (authLoading || tenantLoading) return;
      if (!firebaseUser) {
        setLoadError("You must be logged in");
        setLoading(false);
        return;
      }
      if (!educatorId) {
        setLoadError("Tenant not found. Open this test from your coaching website.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
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

        let meta: TestMeta | null = null;
        let qs: AttemptQuestion[] = [];

        for (const s of sources) {
          const tSnap = await getDoc(s.testDoc);
          if (!tSnap.exists()) continue;

          const d = tSnap.data() as any;
          const durationMinutes = safeNumber(d.durationMinutes, 60);
          const computedSections = [{ id: "main", name: d.subject || "General" }];

          meta = {
            id: tSnap.id,
            title: d.title || "Untitled Test",
            subject: d.subject,
            durationMinutes,
            sections: Array.isArray(d.sections) && d.sections.length ? d.sections : computedSections,
          };

          const qSnap = await getDocs(s.qCol);
          qs = qSnap.docs.map((q) => mapQuestion(q.id, q.data()));
          break;
        }

        if (!meta) throw new Error("Test not found");
        if (!qs.length) throw new Error("No questions found in this test");

        if (!mounted) return;

        setTestMeta(meta);
        setQuestions(qs);
        setDurationSec(meta.durationMinutes * 60);

        const init = buildInitResponses(qs);
        setResponses(init);
        setCurrentIndex(0);
        setCurrentSectionId(qs[0]?.sectionId || "main");

        // Attempt resume: localStorage -> doc -> query
        const loadAttemptById = async (id: string) => {
          const aSnap = await getDoc(doc(db, "attempts", id));
          if (!aSnap.exists()) return null;
          const a = aSnap.data() as AttemptDoc;
          if (a.studentId !== firebaseUser.uid) return null;
          if (a.testId !== testId) return null;
          if (a.status !== "in_progress") return null;
          if (a.educatorId !== educatorId) return null;
          return { id: aSnap.id, ...a } as any;
        };

        let foundAttempt: any = null;
        const cachedId = localStorage.getItem(attemptIdStorageKey);

        if (cachedId) {
          foundAttempt = await loadAttemptById(cachedId);
          if (!foundAttempt) localStorage.removeItem(attemptIdStorageKey);
        }

        if (!foundAttempt) {
          const qAttempt = query(
            collection(db, "attempts"),
            where("studentId", "==", firebaseUser.uid),
            where("testId", "==", testId),
            where("educatorId", "==", educatorId),
            where("status", "==", "in_progress"),
            orderBy("createdAt", "desc"),
            limit(1)
          );
          const aSnap = await getDocs(qAttempt);
          if (!aSnap.empty) {
            const d = aSnap.docs[0];
            foundAttempt = { id: d.id, ...(d.data() as AttemptDoc) };
            localStorage.setItem(attemptIdStorageKey, d.id);
          }
        }

        if (!mounted) return;

        if (foundAttempt) {
          setAttemptId(foundAttempt.id);

          const stored = (foundAttempt.responses || {}) as Record<string, AttemptResponse>;
          setResponses((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((qid) => {
              if (stored[qid]) next[qid] = stored[qid];
            });
            return next;
          });

          setCurrentIndex(safeNumber(foundAttempt.currentIndex, 0));

          const startedMs =
            foundAttempt.startedAtMs ||
            (foundAttempt.startedAt && typeof foundAttempt.startedAt.toMillis === "function"
              ? foundAttempt.startedAt.toMillis()
              : null);

          setAttemptStartedAtMs(startedMs ? safeNumber(startedMs, Date.now()) : null);
          setDurationSec(safeNumber(foundAttempt.durationSec, meta.durationMinutes * 60));

          setIsStarted(false);
          setStartDialogOpen(true);
        } else {
          setAttemptId(null);
          setAttemptStartedAtMs(null);
          setIsStarted(false);
          setStartDialogOpen(true);
        }
      } catch (e: any) {
        console.error(e);
        if (!mounted) return;
        setLoadError(e?.message || "Failed to load test");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [testId, authLoading, tenantLoading, firebaseUser, educatorId, attemptIdStorageKey]);

  // Keep section in sync
  useEffect(() => {
    const q = questions[currentIndex];
    if (q?.sectionId) setCurrentSectionId(q.sectionId);
  }, [questions, currentIndex]);

  // Mark visited (only after started)
  useEffect(() => {
    if (!isStarted || !currentQuestion || !attemptId) return;
    const qId = currentQuestion.id;

    setResponses((prev) => {
      const cur = prev[qId];
      if (!cur || cur.visited) return prev;

      const next = { ...prev, [qId]: { ...cur, visited: true } };
      queueAttemptUpdate({ [`responses.${qId}.visited`]: true, currentIndex });
      return next;
    });
  }, [isStarted, currentQuestion, attemptId, queueAttemptUpdate, currentIndex]);

  // Heartbeat (optional, keeps updatedAt fresh)
  useEffect(() => {
    if (!isStarted || !attemptId) return;
    const i = window.setInterval(() => queueAttemptUpdate({ currentIndex }), 20000);
    return () => window.clearInterval(i);
  }, [isStarted, attemptId, queueAttemptUpdate, currentIndex]);

  // Leave fullscreen on unmount
  useEffect(() => {
    return () => {
      exitFullscreenSafe();
    };
  }, []);

  const goToIndex = (idx: number) => {
    const next = Math.max(0, Math.min(idx, questions.length - 1));
    setCurrentIndex(next);
    if (attemptId) queueAttemptUpdate({ currentIndex: next });
  };

  const handleStart = async () => {
    if (!firebaseUser || !testId || !educatorId || !testMeta) return;

    const fullscreenOk = await requestFullscreenSafe();
    if (!fullscreenOk) toast.message("Fullscreen was blocked by browser. Continuing in normal mode.");

    let id = attemptId;
    let startedAtMs = attemptStartedAtMs;

    try {
      const totalSec = durationSec || testMeta.durationMinutes * 60;

      // Resume expired attempt -> submit immediately
      if (id && startedAtMs && computeRemainingSeconds(startedAtMs, totalSec) <= 0) {
        toast.error("Time is already over. Submitting your test...");
        await handleSubmit(true);
        return;
      }

      if (!id) {
        startedAtMs = Date.now();
        const initialResponses = buildInitResponses(questions);

        const payload: AttemptDoc = {
          studentId: firebaseUser.uid,
          educatorId,
          tenantSlug: tenantSlug || null,
          testId,
          testTitle: testMeta.title,
          subject: testMeta.subject,
          status: "in_progress",
          durationSec: totalSec,
          startedAtMs,
          currentIndex,
          responses: initialResponses,
          createdAt: serverTimestamp(),
          startedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const ref = await addDoc(collection(db, "attempts"), payload);
        id = ref.id;

        setAttemptId(id);
        localStorage.setItem(attemptIdStorageKey, id);

        setResponses((prev) => ({ ...initialResponses, ...prev }));
      } else if (!startedAtMs) {
        startedAtMs = Date.now();
        setAttemptStartedAtMs(startedAtMs);
        await updateDoc(doc(db, "attempts", id), { startedAtMs, updatedAt: serverTimestamp() });
      }

      const remaining = computeRemainingSeconds(startedAtMs!, totalSec);
      setAttemptStartedAtMs(startedAtMs!);
      setDurationSec(totalSec);
      setTimerStartSeconds(remaining);

      setIsStarted(true);
      setStartDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to start test");
    }
  };

  const handleAnswer = (answer: string) => {
    if (!currentQuestion || !attemptId) return;

    setResponses((prev) => ({
      ...prev,
      [currentQuestion.id]: { ...prev[currentQuestion.id], answer, answered: String(answer).length > 0 },
    }));

    queueAttemptUpdate({
      [`responses.${currentQuestion.id}.answer`]: answer,
      [`responses.${currentQuestion.id}.answered`]: String(answer).length > 0,
      currentIndex,
    });
  };

  const handleMarkForReview = () => {
    if (!currentQuestion || !attemptId) return;
    const nextVal = !responses[currentQuestion.id]?.markedForReview;

    setResponses((prev) => ({
      ...prev,
      [currentQuestion.id]: { ...prev[currentQuestion.id], markedForReview: nextVal },
    }));

    queueAttemptUpdate({ [`responses.${currentQuestion.id}.markedForReview`]: nextVal, currentIndex });
  };

  const handleClearResponse = () => {
    if (!currentQuestion || !attemptId) return;

    setResponses((prev) => ({
      ...prev,
      [currentQuestion.id]: { ...prev[currentQuestion.id], answer: null, answered: false },
    }));

    queueAttemptUpdate({
      [`responses.${currentQuestion.id}.answer`]: null,
      [`responses.${currentQuestion.id}.answered`]: false,
      currentIndex,
    });
  };

  const computeScore = () => {
    let score = 0;
    let maxScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    for (const q of questions) {
      maxScore += safeNumber(q.marks.correct, 0);

      const ans = responses[q.id]?.answer;
      if (ans === null || ans === undefined || String(ans).trim() === "") {
        unansweredCount += 1;
        continue;
      }

      if (q.type === "integer") {
        if (String(ans).trim() === String(q.correctAnswer ?? "").trim()) {
          score += safeNumber(q.marks.correct, 0);
          correctCount += 1;
        } else {
          score -= safeNumber(q.marks.incorrect, 0);
          incorrectCount += 1;
        }
      } else {
        if (String(ans) === String(q.correctAnswer ?? "")) {
          score += safeNumber(q.marks.correct, 0);
          correctCount += 1;
        } else {
          score -= safeNumber(q.marks.incorrect, 0);
          incorrectCount += 1;
        }
      }
    }

    const attempted = correctCount + incorrectCount;
    const accuracy = attempted > 0 ? correctCount / attempted : 0;

    return { score, maxScore, correctCount, incorrectCount, unansweredCount, accuracy };
  };

  const flushPendingSaves = async () => {
    if (!attemptRef) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const pending = pendingUpdateRef.current;
    pendingUpdateRef.current = {};
    if (Object.keys(pending).length > 0) await updateDoc(attemptRef, { ...pending, updatedAt: serverTimestamp() });
  };

  const handleSubmit = async (isAutoSubmit = false) => {
    if (!attemptId || !firebaseUser || !testId || !educatorId || !testMeta) return;

    try {
      setSaving(true);
      await flushPendingSaves();

      const { score, maxScore, correctCount, incorrectCount, unansweredCount, accuracy } = computeScore();
      const totalSec = durationSec || testMeta.durationMinutes * 60;
      const startedAtMs = attemptStartedAtMs || Date.now();
      const remaining = computeRemainingSeconds(startedAtMs, totalSec);
      const timeTakenSec = Math.max(0, totalSec - remaining);

      await updateDoc(doc(db, "attempts", attemptId), {
        status: "submitted",
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        score,
        maxScore,
        correctCount,
        incorrectCount,
        unansweredCount,
        accuracy,
        timeTakenSec,
      });

      localStorage.removeItem(attemptIdStorageKey);
      await exitFullscreenSafe();

      navigate(`/student/results/${attemptId}?fromTest=true${isAutoSubmit ? "&auto=1" : ""}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to submit test");
    } finally {
      setSaving(false);
      setSubmitDialogOpen(false);
    }
  };

  const handleTimeUp = async () => {
    toast.error("Time's up! Submitting your test...");
    await handleSubmit(true);
  };

  // Warn on reload/close while started
  useEffect(() => {
    if (!isStarted) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isStarted]);

  if (loading || authLoading || tenantLoading) return <div className="text-center py-12">Loading...</div>;
  if (loadError || !testMeta || !currentQuestion) return <div className="text-center py-12">{loadError || "Failed to load test"}</div>;

  const timerKey = isStarted ? `running_${attemptId || "new"}` : `paused_${attemptId || "new"}`;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-4">
      {/* Start / Resume (Fullscreen) */}
      <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Maximize2 className="h-5 w-5" /> {attemptId ? "Resume Test" : "Start Test"}
            </DialogTitle>
            <DialogDescription>
              {attemptId
                ? "You have an in-progress attempt. Click Resume to continue (fullscreen recommended)."
                : "Click Start to begin. The test will open in fullscreen (recommended)."}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl bg-muted/40 p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Test</span>
              <span className="font-medium">{testMeta.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium">{testMeta.durationMinutes} minutes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Questions</span>
              <span className="font-medium">{questions.length}</span>
            </div>
            {attemptId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{answeredCount} answered</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStartDialogOpen(false)}>
              Preview
            </Button>
            <Button className="gradient-bg" onClick={handleStart}>
              {attemptId ? "Resume Test" : "Start Test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-4 bg-card rounded-xl mb-4">
          <div className="flex items-center gap-4">
            {isStarted ? (
              <TimerChip key={timerKey} initialSeconds={timerStartSeconds} onTimeUp={handleTimeUp} />
            ) : (
              <div className="px-3 py-1 rounded-full bg-muted text-xs font-semibold">{`Not started • ${testMeta.durationMinutes}m`}</div>
            )}
            <div className="hidden sm:block">
              <p className="font-semibold text-sm">{testMeta.title}</p>
              <p className="text-xs text-muted-foreground">
                Question {currentIndex + 1} of {questions.length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={cn("flex items-center gap-1 text-xs", saving ? "text-yellow-600" : "text-green-600")}>
              <Save className="h-3 w-3" />
              {saving ? "Saving…" : lastSavedAt ? "Saved" : "Ready"}
            </div>

            {!isStarted && (
              <Button size="sm" className="rounded-lg gradient-bg" onClick={handleStart}>
                {attemptId ? "Resume" : "Start"}
              </Button>
            )}

            <Button
              variant="destructive"
              size="sm"
              className="rounded-lg"
              onClick={() => setSubmitDialogOpen(true)}
              disabled={!isStarted}
            >
              Submit
            </Button>
          </div>
        </div>

        {/* Section Tabs */}
        {testMeta.sections.length > 1 && (
          <Tabs value={currentSectionId} onValueChange={setCurrentSectionId} className="mb-4">
            <TabsList className="w-full justify-start overflow-x-auto rounded-xl">
              {testMeta.sections.map((section) => (
                <TabsTrigger key={section.id} value={section.id} className="rounded-lg">
                  {section.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Question Area */}
        <Card className="flex-1 card-soft border-0 overflow-auto">
          <CardContent className="p-6 space-y-6">
            {!!currentQuestion.passage && (
              <div className="p-4 bg-pastel-cream rounded-xl">
                <p className="font-semibold mb-2">{currentQuestion.passage.title}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{currentQuestion.passage.content}</p>
              </div>
            )}

            <div>
              <p className="font-semibold text-lg">
                Q{currentIndex + 1}. {currentQuestion.stem}
              </p>
            </div>

            {currentQuestion.type === "mcq" && currentQuestion.options && (
              <RadioGroup
                value={responses[currentQuestion.id]?.answer || ""}
                onValueChange={handleAnswer}
                className="space-y-3"
                disabled={!isStarted}
              >
                {currentQuestion.options.map((option, i) => (
                  <div
                    key={option.id}
                    className={cn(
                      "flex items-center space-x-3 p-4 rounded-xl border-2 transition-colors cursor-pointer",
                      responses[currentQuestion.id]?.answer === option.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50",
                      !isStarted && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <RadioGroupItem value={option.id} id={`${currentQuestion.id}_${option.id}`} />
                    <Label htmlFor={`${currentQuestion.id}_${option.id}`} className="flex-1 cursor-pointer">
                      {String.fromCharCode(65 + i)}. {option.text}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {currentQuestion.type === "integer" && (
              <Input
                type="number"
                placeholder="Enter your answer"
                value={responses[currentQuestion.id]?.answer || ""}
                onChange={(e) => handleAnswer(e.target.value)}
                className="max-w-xs rounded-xl text-lg"
                disabled={!isStarted}
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2 mt-4">
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl" onClick={handleClearResponse} disabled={!isStarted}>
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button
              variant={responses[currentQuestion.id]?.markedForReview ? "default" : "outline"}
              className={cn("rounded-xl", responses[currentQuestion.id]?.markedForReview && "bg-purple-500 hover:bg-purple-600")}
              onClick={handleMarkForReview}
              disabled={!isStarted}
            >
              <Flag className="h-4 w-4 mr-1" />
              Mark
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl" disabled={currentIndex === 0} onClick={() => goToIndex(currentIndex - 1)}>
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button className="rounded-xl gradient-bg" disabled={currentIndex === questions.length - 1} onClick={() => goToIndex(currentIndex + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Question Palette (Desktop) */}
      <Card className="hidden lg:block w-72 card-soft border-0">
        <CardContent className="p-4">
          <p className="font-semibold mb-4">Question Palette</p>
          <CBTQuestionPalette
            questions={questions.map((q) => ({ id: q.id, sectionId: q.sectionId }))}
            responses={responses}
            currentQuestionIndex={currentIndex}
            onQuestionClick={(idx) => goToIndex(idx)}
            sections={testMeta.sections}
            currentSectionId={currentSectionId}
          />
        </CardContent>
      </Card>

      {/* Submit Dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" /> Submit Test?
            </DialogTitle>
            <DialogDescription>Are you sure you want to submit? You won't be able to change your answers.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4 text-sm">
            <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
              <p className="font-semibold text-green-700 dark:text-green-400">{answeredCount}</p>
              <p className="text-xs text-muted-foreground">Answered</p>
            </div>
            <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
              <p className="font-semibold text-red-700 dark:text-red-400">{unansweredVisitedCount}</p>
              <p className="text-xs text-muted-foreground">Unanswered</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="gradient-bg" onClick={() => handleSubmit(false)} disabled={!isStarted}>
              Submit Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


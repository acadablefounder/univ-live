import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpen,
  Search,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  ToggleLeft,
  ToggleRight,
  ListChecks,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  getDoc,
} from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import EmptyState from "@/components/admin/EmptyState";
import { toast } from "@/hooks/use-toast";

type StatusFilter = "all" | "published" | "draft";

type TestSeries = {
  id: string;
  title: string;
  subject: string;
  level?: string;
  description?: string;

  durationMinutes: number;
  price: number;
  attemptsAllowed: number;

  questionsCount: number;

  isPublished: boolean;
  createdAtTs?: Timestamp | null;
  updatedAtTs?: Timestamp | null;
};

function safeNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtDate(ts?: Timestamp | null) {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}

function statusBadgeClass(published: boolean) {
  return published
    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    : "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300";
}

export default function TestBank() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<TestSeries[]>([]);

  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState<string>("All");
  const [status, setStatus] = useState<StatusFilter>("all");

  // 🔐 Admin guard (minimal)
  const isAdmin = profile?.role === "ADMIN";

  // Realtime load tests
  useEffect(() => {
    if (authLoading) return;

    if (!isAdmin) {
      setLoading(false);
      setTests([]);
      return;
    }

    setLoading(true);

    const qRef = query(collection(db, "test_series"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows: TestSeries[] = snap.docs.map((d) => {
          const data = d.data() as any;

          const createdAt = (data?.createdAt as Timestamp) || null;
          const updatedAt = (data?.updatedAt as Timestamp) || null;

          return {
            id: d.id,
            title: String(data?.title || "Untitled Test"),
            subject: String(data?.subject || "General"),
            level: data?.level ? String(data.level) : (data?.difficulty ? String(data.difficulty) : undefined),
            description: data?.description ? String(data.description) : undefined,

            durationMinutes: safeNum(data?.durationMinutes ?? data?.duration, 60),
            price: Math.max(0, safeNum(data?.price, 0)),
            attemptsAllowed: Math.max(1, safeNum(data?.attemptsAllowed ?? data?.maxAttempts, 3)),

            questionsCount: Math.max(
              0,
              safeNum(
                data?.questionsCount ?? data?.totalQuestions ?? data?.questionCount,
                0
              )
            ),

            isPublished: Boolean(data?.isPublished ?? data?.published ?? false),
            createdAtTs: createdAt,
            updatedAtTs: updatedAt,
          };
        });

        setTests(rows);
        setLoading(false);
      },
      () => {
        setTests([]);
        setLoading(false);
        toast({
          title: "Failed to load tests",
          description: "Please refresh and try again.",
          variant: "destructive",
        });
      }
    );

    return () => unsub();
  }, [authLoading, isAdmin]);

  const subjects = useMemo(() => {
    const set = new Set<string>(["All"]);
    tests.forEach((t) => t.subject && set.add(t.subject));
    return Array.from(set);
  }, [tests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return tests.filter((t) => {
      const matchesSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q);

      const matchesSubject = subject === "All" || t.subject === subject;

      const matchesStatus =
        status === "all" ||
        (status === "published" ? t.isPublished : !t.isPublished);

      return matchesSearch && matchesSubject && matchesStatus;
    });
  }, [tests, search, subject, status]);

  const stats = useMemo(() => {
    const total = tests.length;
    const published = tests.filter((t) => t.isPublished).length;
    const draft = total - published;
    const totalQuestions = tests.reduce((acc, t) => acc + (t.questionsCount || 0), 0);
    return { total, published, draft, totalQuestions };
  }, [tests]);

  async function togglePublish(test: TestSeries) {
    try {
      await updateDoc(doc(db, "test_series", test.id), {
        isPublished: !test.isPublished,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: test.isPublished ? "Unpublished" : "Published",
        description: `${test.title} is now ${test.isPublished ? "draft" : "published"}.`,
      });
    } catch {
      toast({
        title: "Failed",
        description: "Could not update publish status.",
        variant: "destructive",
      });
    }
  }

  async function deleteTest(test: TestSeries) {
    const ok = window.confirm(`Delete "${test.title}"?\n\nThis will also delete its questions.`);
    if (!ok) return;

    try {
      // delete questions first (best-effort)
      const qSnap = await getDocs(collection(db, "test_series", test.id, "questions"));
      if (!qSnap.empty) {
        let batch = writeBatch(db);
        let ops = 0;

        for (const qDoc of qSnap.docs) {
          batch.delete(doc(db, "test_series", test.id, "questions", qDoc.id));
          ops++;
          if (ops >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
        if (ops > 0) await batch.commit();
      }

      await deleteDoc(doc(db, "test_series", test.id));

      toast({ title: "Deleted", description: "Test removed successfully." });
    } catch {
      toast({
        title: "Delete failed",
        description: "Could not delete the test.",
        variant: "destructive",
      });
    }
  }

  async function duplicateTest(test: TestSeries) {
    try {
      // fetch original doc data (so we copy any fields we don't explicitly track)
      const srcRef = doc(db, "test_series", test.id);
      const srcSnap = await getDoc(srcRef);
      if (!srcSnap.exists()) {
        toast({ title: "Not found", description: "Original test no longer exists.", variant: "destructive" });
        return;
      }

      const srcData = srcSnap.data() as any;

      // create new test doc
      const newTitle = `${String(srcData?.title || test.title)} (Copy)`;

      const newDocRef = await addDoc(collection(db, "test_series"), {
        ...srcData,
        title: newTitle,
        isPublished: false, // copies always start as draft
        publishedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // copy questions subcollection
      const qSnap = await getDocs(collection(db, "test_series", test.id, "questions"));
      if (!qSnap.empty) {
        let batch = writeBatch(db);
        let ops = 0;

        for (const qDoc of qSnap.docs) {
          batch.set(
            doc(db, "test_series", newDocRef.id, "questions", qDoc.id),
            {
              ...qDoc.data(),
              // keep timestamps if you want, but updatedAt is useful
              duplicatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          ops++;
          if (ops >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
        if (ops > 0) await batch.commit();
      }

      toast({
        title: "Duplicated",
        description: "Test + questions copied as a draft.",
      });

      // optionally open edit
      navigate(`/admin/tests/edit/${newDocRef.id}`);
    } catch (e) {
      console.error(e);
      toast({
        title: "Duplicate failed",
        description: "Could not duplicate the test.",
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold">Test Bank</h1>
            <p className="text-muted-foreground text-sm">Manage global tests (Admin)</p>
          </div>
        </div>

        <Card className="card-soft border-0">
          <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading tests...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Test Bank</h1>
          <p className="text-muted-foreground text-sm">Admin access required</p>
        </div>
        <EmptyState
          icon={BookOpen}
          title="Admin only"
          description="Please login with an Admin account to access the test bank."
          actionLabel="Go to Login"
          onAction={() => (window.location.href = "/login?role=admin")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Test Bank</h1>
          <p className="text-muted-foreground text-sm">Create and manage global tests</p>
        </div>

        <Button className="gradient-bg text-white" onClick={() => navigate("/admin/tests/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Create Test
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Tests", value: stats.total },
          { label: "Published", value: stats.published },
          { label: "Drafts", value: stats.draft },
          { label: "Total Questions", value: stats.totalQuestions },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card className="card-soft border-0">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <Card className="card-soft border-0">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tests by title/description..."
                className="pl-9 rounded-xl"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto">
              {subjects.map((s) => (
                <Badge
                  key={s}
                  variant={subject === s ? "default" : "secondary"}
                  className="cursor-pointer rounded-full whitespace-nowrap"
                  onClick={() => setSubject(s)}
                >
                  {s}
                </Badge>
              ))}
            </div>

            <div className="flex gap-2">
              {(["all", "published", "draft"] as StatusFilter[]).map((st) => (
                <Badge
                  key={st}
                  variant={status === st ? "default" : "secondary"}
                  className="cursor-pointer rounded-full capitalize"
                  onClick={() => setStatus(st)}
                >
                  {st}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No tests found"
          description="Create your first test or adjust filters."
          actionLabel="Create Test"
          onAction={() => navigate("/admin/tests/new")}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t, idx) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.03, 0.25) }}
            >
              <Card className="card-soft border-0 hover:shadow-card transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{t.title}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="secondary" className="rounded-full">
                          {t.subject}
                        </Badge>
                        {t.level && (
                          <Badge variant="outline" className="rounded-full">
                            {t.level}
                          </Badge>
                        )}
                        <Badge variant="secondary" className={cn("rounded-full", statusBadgeClass(t.isPublished))}>
                          {t.isPublished ? "published" : "draft"}
                        </Badge>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem onClick={() => navigate(`/admin/tests/edit/${t.id}`)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/admin/questions/${t.id}`)}>
                          <ListChecks className="h-4 w-4 mr-2" />
                          Manage Questions
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateTest(t)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => togglePublish(t)}>
                          {t.isPublished ? (
                            <>
                              <ToggleLeft className="h-4 w-4 mr-2" />
                              Unpublish
                            </>
                          ) : (
                            <>
                              <ToggleRight className="h-4 w-4 mr-2" />
                              Publish
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => deleteTest(t)}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {t.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                    <div className="p-3 rounded-xl bg-muted/40">
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="font-medium">{t.durationMinutes} min</p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/40">
                      <p className="text-xs text-muted-foreground">Questions</p>
                      <p className="font-medium">{t.questionsCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/40">
                      <p className="text-xs text-muted-foreground">Price</p>
                      <p className="font-medium">{t.price > 0 ? `₹${t.price}` : "Free"}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/40">
                      <p className="text-xs text-muted-foreground">Attempts</p>
                      <p className="font-medium">{t.attemptsAllowed}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                    <span>Created: {fmtDate(t.createdAtTs || null)}</span>
                    <span>Updated: {fmtDate(t.updatedAtTs || null)}</span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      className="rounded-xl flex-1"
                      onClick={() => navigate(`/admin/questions/${t.id}`)}
                    >
                      Manage Questions
                    </Button>
                    <Button
                      className="gradient-bg text-white rounded-xl flex-1"
                      onClick={() => navigate(`/admin/tests/edit/${t.id}`)}
                    >
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}


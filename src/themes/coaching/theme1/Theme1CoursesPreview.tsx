import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, FileText, Star, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useTenant } from "@/contexts/TenantProvider";
import { collection, query, where, limit, getDocs, orderBy, documentId } from "firebase/firestore";
import { db } from "@/lib/firebase";

type TestSeries = {
  id: string;
  title: string;
  description: string;
  price: string | number;
  coverImage?: string;
  subject?: string;
  difficulty?: string;
  testsCount?: number;
};

export default function Theme1CoursesPreview() {
  const { tenant } = useTenant();
  const [courses, setCourses] = useState<TestSeries[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenant?.educatorId) return;

    const fetchCourses = async () => {
      try {
        let q;
        // Check if educator has selected specific tests in Website Settings
        const featuredIds = tenant.websiteConfig?.featuredTestIds || [];

        // CASE A: Educator has manually selected tests to show
        if (featuredIds.length > 0) {
          // Firestore 'in' query supports up to 10 items
          const safeIds = featuredIds.slice(0, 10); 
          q = query(
            collection(db, "educators", tenant.educatorId, "my_tests"),
            where(documentId(), "in", safeIds)
          );
        } 
        // CASE B: No selection, show top 4 newest
        else {
          q = query(
            collection(db, "educators", tenant.educatorId, "my_tests"),
            orderBy("createdAt", "desc"),
            limit(4)
          );
        }

        const snap = await getDocs(q);
        const fetchedData = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data
        })) as TestSeries[];

        setCourses(fetchedData);
      } catch (error) {
        console.error("Error fetching courses:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [tenant]);

  if (!tenant) return null;
  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (courses.length === 0) return null;

  return (
    <section className="py-20 bg-pastel-cream/30 dark:bg-muted/10">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-4 text-primary bg-primary/10 hover:bg-primary/20 transition-colors">
              Featured Content
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
              Featured Exam Series
            </h2>
            <p className="text-muted-foreground text-lg">
              Handpicked test series to help you prepare effectively.
            </p>
          </div>
          <Link to="/courses">
            <Button variant="outline" className="group">
              View All Series
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {courses.map((course, index) => (
            <motion.div
              key={course.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Link to={`/course/${course.id}`}>
                <Card className="h-full overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50 bg-card/50 backdrop-blur-sm group">
                  <div className="aspect-video relative overflow-hidden bg-muted">
                    {course.coverImage ? (
                       <img
                         src={course.coverImage}
                         alt={course.title}
                         className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                       />
                    ) : (
                       <div className="w-full h-full flex flex-col items-center justify-center bg-primary/5 text-primary/40 gap-2">
                          <FileText className="h-10 w-10" />
                       </div>
                    )}
                    {course.subject && (
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-white/90 text-black hover:bg-white shadow-sm backdrop-blur-md">
                          {course.subject}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <CardContent className="p-5">
                    <h3 className="font-bold text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors">
                      {course.title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4 h-10">
                      {course.description}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                      <span className={`font-bold ${course.price === "Included" || course.price == 0 ? "text-green-600" : ""}`}>
                         {course.price === "Included" || course.price == 0 ? "Free" : `₹${course.price}`}
                      </span>
                      <Button size="sm" variant="secondary" className="rounded-full h-8 w-8 p-0">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

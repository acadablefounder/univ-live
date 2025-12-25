import { useEffect, useState } from "react";
import {
  Save,
  Loader2,
  Plus,
  Trash2,
  Trophy,
  BookOpen,
  CheckSquare,
  Square,
  User,
  Quote,
  Layout,
  BarChart,
  ImageIcon,
  ArrowRight
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthProvider"; 
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  orderBy
} from "firebase/firestore";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useTenant } from "@/contexts/TenantProvider";

// --- Types ---
type StatItem = { label: string; value: string; icon: string };
type AchievementItem = { title: string; description: string; icon: string };
type FacultyItem = { name: string; subject: string; designation: string; experience: string; bio: string; image: string };
type TestimonialItem = { name: string; course: string; rating: number; text: string; avatar: string };

// New Type for Featured Tests
type AvailableTest = {
  id: string;
  title: string;
  subject: string;
  price: string | number;
};

export default function WebsiteSettings() {
  const { firebaseUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // --- Existing Website Content State ---
  const [coachingName, setCoachingName] = useState("");
  const [tagline, setTagline] = useState("");
  const [heroImage, setHeroImage] = useState("");
  
  const [stats, setStats] = useState<StatItem[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [faculty, setFaculty] = useState<FacultyItem[]>([]);
  const [testimonials, setTestimonials] = useState<TestimonialItem[]>([]);

  // --- NEW: Featured Courses State ---
  const [availableTests, setAvailableTests] = useState<AvailableTest[]>([]); 
  const [featuredTestIds, setFeaturedTestIds] = useState<string[]>([]); 

  const {tenant} = useTenant();

  // --- 1. Fetch All Data ---
  useEffect(() => {
    if (!firebaseUser) return;

    const fetchData = async () => {
      try {
        // A. Fetch Educator Profile (Where websiteConfig lives)
        const educatorRef = doc(db, "educators", firebaseUser.uid);
        const educatorSnap = await getDoc(educatorRef);

        if (educatorSnap.exists()) {
          const data = educatorSnap.data().websiteConfig || {};
          
          // Load existing settings
          setCoachingName(data.coachingName || "");
          setTagline(data.tagline || "");
          setHeroImage(data.heroImage || "");
          setStats(data.stats || []);
          setAchievements(data.achievements || []);
          setFaculty(data.faculty || []);
          setTestimonials(data.testimonials || []);
          
          // Load Featured Tests selection
          setFeaturedTestIds(data.featuredTestIds || []);
        }

        // B. Fetch Educator's Tests (To display in the selection list)
        // We query the 'my_tests' sub-collection
        const testsQuery = query(
          collection(db, "educators", firebaseUser.uid, "my_tests"),
          orderBy("createdAt", "desc")
        );
        const testsSnap = await getDocs(testsQuery);
        
        const testsData = testsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as AvailableTest[];
        
        setAvailableTests(testsData);

      } catch (err) {
        console.error("Error loading settings:", err);
        toast.error("Failed to load website settings");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [firebaseUser]);

  // --- 2. Save Data ---
  const handleSave = async () => {
    if (!firebaseUser) return;
    setSaving(true);

    try {
      const educatorRef = doc(db, "educators", firebaseUser.uid);
      
      // Construct the config object with ALL fields
      const websiteConfig = {
        coachingName,
        tagline,
        heroImage,
        stats,
        achievements,
        faculty,
        testimonials,
        featuredTestIds, // Includes the new selection
        updatedAt: new Date()
      };

      // Clean undefined values to prevent Firebase errors
      Object.keys(websiteConfig).forEach(key => 
        (websiteConfig as any)[key] === undefined && delete (websiteConfig as any)[key]
      );

      // Save to Firestore
      await updateDoc(educatorRef, { websiteConfig });
      
      toast.success("Website published successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  // --- Helper: Toggle Featured Course ---
  const toggleFeatured = (testId: string) => {
    setFeaturedTestIds(prev => 
      prev.includes(testId) 
        ? prev.filter(id => id !== testId) // Remove if already selected
        : [...prev, testId] // Add if not selected
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1 max-w-5xl mx-auto">

      {/* Welcome Banner */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="gradient-bg rounded-2xl p-6 text-white relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnYyaDR2MmgtNHYtMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
              <div className="relative z-10">
                <h1 className="text-2xl sm:text-3xl font-display font-bold mb-2">
                  Welcome back, {tenant.coachingName}! 👋
                </h1>
                <p className="text-white/80 text-sm sm:text-base max-w-xl">
                  Your website is love! on {" "}
                  <span className="font-semibold text-white">https://{tenant.tenantSlug}.univ.live</span>
                </p>
                <div className="flex flex-wrap gap-3 mt-4">
                  <Button
                    size="sm"
                    className="bg-white/20 hover:bg-white/30 text-white border-0"
                    onClick={() => {
                      const slug = tenant?.tenantSlug;
                      if (!slug) {
                        toast.error("Website not available — tenant slug is missing.");
                        return;
                      }
                      const url = `https://${slug}.univ.live`;
                      // Open in a new tab safely
                      window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Visit Your Website
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Website Builder</h1>
          <p className="text-muted-foreground">Manage the content visible on your public website.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gradient-bg text-white shadow-md">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Publish Changes
        </Button>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0 justify-start mb-6">
          <TabsTrigger value="general" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border bg-card shadow-sm"><Layout className="w-4 h-4 mr-2" /> General</TabsTrigger>
          <TabsTrigger value="courses" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border bg-card shadow-sm"><BookOpen className="w-4 h-4 mr-2" /> Featured</TabsTrigger>
          <TabsTrigger value="stats" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border bg-card shadow-sm"><BarChart className="w-4 h-4 mr-2" /> Stats</TabsTrigger>
          <TabsTrigger value="achievements" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border bg-card shadow-sm"><Trophy className="w-4 h-4 mr-2" /> Awards</TabsTrigger>
          <TabsTrigger value="faculty" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border bg-card shadow-sm"><User className="w-4 h-4 mr-2" /> Faculty</TabsTrigger>
          <TabsTrigger value="testimonials" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border bg-card shadow-sm"><Quote className="w-4 h-4 mr-2" /> Reviews</TabsTrigger>
        </TabsList>

        {/* --- 1. General Tab --- */}
        <TabsContent value="general" className="space-y-6">
           <Card>
             <CardHeader>
               <CardTitle>Hero Section</CardTitle>
               <CardDescription>This is the first thing students see on your landing page.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Institute Name</Label>
                  <Input 
                    value={coachingName} 
                    onChange={e => setCoachingName(e.target.value)} 
                    placeholder="e.g. Acme Academy"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tagline / Headline</Label>
                  <Input 
                    value={tagline} 
                    onChange={e => setTagline(e.target.value)} 
                    placeholder="e.g. Empowering Next Gen Leaders"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hero Image URL</Label>
                  <Input 
                    value={heroImage} 
                    onChange={e => setHeroImage(e.target.value)} 
                    placeholder="https://example.com/hero.jpg"
                  />
                  {heroImage ? (
                    <div className="mt-2 relative h-40 rounded-md overflow-hidden border">
                      <img src={heroImage} alt="Hero Preview" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="mt-2 h-40 rounded-md border border-dashed flex items-center justify-center bg-muted/30">
                      <div className="text-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <span className="text-xs">No image provided</span>
                      </div>
                    </div>
                  )}
                </div>
             </CardContent>
           </Card>
        </TabsContent>

        {/* --- 2. Featured Courses Tab (NEW SECTION) --- */}
        <TabsContent value="courses">
          <Card>
            <CardHeader>
              <CardTitle>Featured Test Series</CardTitle>
              <CardDescription>
                Select which tests appear on your home page. 
                <span className="block mt-1 text-xs text-muted-foreground">
                  Note: If you don't select any, the 4 newest tests will be shown automatically.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableTests.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed rounded-lg bg-muted/20">
                  <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-medium">No tests found</p>
                  <p className="text-sm text-muted-foreground">Go to the "Test Series" tab to create your first exam.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableTests.map((test) => {
                    const isSelected = featuredTestIds.includes(test.id);
                    return (
                      <div 
                        key={test.id}
                        onClick={() => toggleFeatured(test.id)}
                        className={`
                          cursor-pointer flex items-center gap-3 p-4 rounded-lg border transition-all select-none
                          ${isSelected 
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                            : 'border-border hover:bg-muted/50'}
                        `}
                      >
                        <div className={`
                          flex items-center justify-center
                          ${isSelected ? 'text-primary' : 'text-muted-foreground'}
                        `}>
                           {isSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm line-clamp-1">{test.title}</h4>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">
                               {test.subject}
                             </span>
                             <span className={`text-xs font-medium ${test.price === "Included" ? "text-green-600" : ""}`}>
                               {test.price === "Included" ? "Free" : `₹${test.price}`}
                             </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- 3. Stats Tab --- */}
        <TabsContent value="stats">
           <Card>
             <CardHeader>
               <CardTitle>Key Statistics</CardTitle>
               <CardDescription>Showcase your institute's impact.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
               {stats.map((stat, idx) => (
                 <div key={idx} className="flex gap-4 items-end p-3 border rounded-lg bg-card">
                    <div className="flex-1 space-y-2">
                       <Label>Label</Label>
                       <Input 
                         value={stat.label} 
                         onChange={e => {
                           const list = [...stats]; list[idx].label = e.target.value; setStats(list);
                         }} 
                         placeholder="e.g. Students"
                       />
                    </div>
                    <div className="flex-1 space-y-2">
                       <Label>Value</Label>
                       <Input 
                         value={stat.value} 
                         onChange={e => {
                           const list = [...stats]; list[idx].value = e.target.value; setStats(list);
                         }} 
                         placeholder="e.g. 1000+"
                       />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => {
                       setStats(stats.filter((_, i) => i !== idx));
                    }}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                 </div>
               ))}
               <Button variant="outline" className="w-full border-dashed" onClick={() => setStats([...stats, { label: "", value: "", icon: "Users" }])}>
                 <Plus className="mr-2 h-4 w-4" /> Add Stat
               </Button>
             </CardContent>
           </Card>
        </TabsContent>

        {/* --- 4. Achievements Tab --- */}
        <TabsContent value="achievements">
           <Card>
             <CardHeader>
               <CardTitle>Awards & Achievements</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
               {achievements.map((item, idx) => (
                 <div key={idx} className="p-4 border rounded-lg space-y-4 relative bg-card">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2"
                      onClick={() => setAchievements(achievements.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <Label>Title</Label>
                          <Input value={item.title} onChange={e => {
                            const list = [...achievements]; list[idx].title = e.target.value; setAchievements(list);
                          }} placeholder="e.g. Best Coaching 2024" />
                       </div>
                       <div className="space-y-2">
                          <Label>Description</Label>
                          <Input value={item.description} onChange={e => {
                            const list = [...achievements]; list[idx].description = e.target.value; setAchievements(list);
                          }} placeholder="Short detail..." />
                       </div>
                    </div>
                 </div>
               ))}
               <Button variant="outline" className="w-full border-dashed" onClick={() => setAchievements([...achievements, { title: "", description: "", icon: "Trophy" }])}>
                 <Plus className="mr-2 h-4 w-4" /> Add Achievement
               </Button>
             </CardContent>
           </Card>
        </TabsContent>

        {/* --- 5. Faculty Tab --- */}
        <TabsContent value="faculty">
           <Card>
             <CardHeader>
               <CardTitle>Our Faculty</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
               {faculty.map((item, idx) => (
                 <div key={idx} className="p-4 border rounded-lg space-y-4 relative bg-card">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2"
                      onClick={() => setFaculty(faculty.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <Label>Name</Label>
                          <Input value={item.name} onChange={e => {
                            const list = [...faculty]; list[idx].name = e.target.value; setFaculty(list);
                          }} placeholder="Dr. Smith" />
                       </div>
                       <div className="space-y-2">
                          <Label>Subject / Designation</Label>
                          <Input value={item.subject} onChange={e => {
                            const list = [...faculty]; list[idx].subject = e.target.value; setFaculty(list);
                          }} placeholder="Physics HOD" />
                       </div>
                       <div className="space-y-2 md:col-span-2">
                          <Label>Bio</Label>
                          <Textarea value={item.bio} onChange={e => {
                            const list = [...faculty]; list[idx].bio = e.target.value; setFaculty(list);
                          }} placeholder="10+ years experience..." />
                       </div>
                       <div className="space-y-2 md:col-span-2">
                          <Label>Image URL</Label>
                          <Input value={item.image} onChange={e => {
                            const list = [...faculty]; list[idx].image = e.target.value; setFaculty(list);
                          }} placeholder="https://..." />
                       </div>
                    </div>
                 </div>
               ))}
               <Button variant="outline" className="w-full border-dashed" onClick={() => setFaculty([...faculty, { name: "", subject: "", designation: "", experience: "", bio: "", image: "" }])}>
                 <Plus className="mr-2 h-4 w-4" /> Add Faculty Member
               </Button>
             </CardContent>
           </Card>
        </TabsContent>

        {/* --- 6. Testimonials Tab --- */}
        <TabsContent value="testimonials">
          <Card>
            <CardHeader>
               <CardTitle>Student Reviews</CardTitle>
            </CardHeader>
            <CardContent>
               <div className="space-y-6">
                {testimonials.map((item, idx) => (
                  <div key={idx} className="p-4 border rounded-lg relative bg-card">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2"
                      onClick={() => setTestimonials(testimonials.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <Label>Student Name</Label>
                          <Input value={item.name} onChange={e => {
                            const list = [...testimonials]; list[idx].name = e.target.value; setTestimonials(list);
                          }} />
                       </div>
                       <div className="space-y-2">
                          <Label>Course/Exam</Label>
                          <Input value={item.course} onChange={e => {
                            const list = [...testimonials]; list[idx].course = e.target.value; setTestimonials(list);
                          }} />
                       </div>
                       <div className="space-y-2 md:col-span-2">
                          <Label>Review Text</Label>
                          <Textarea value={item.text} onChange={e => {
                            const list = [...testimonials]; list[idx].text = e.target.value; setTestimonials(list);
                          }} />
                       </div>
                       <div className="space-y-2">
                          <Label>Avatar URL</Label>
                          <Input value={item.avatar} onChange={e => {
                            const list = [...testimonials]; list[idx].avatar = e.target.value; setTestimonials(list);
                          }} placeholder="https://..." />
                       </div>
                       <div className="space-y-2">
                          <Label>Rating (1-5)</Label>
                          <Input type="number" max={5} min={1} value={item.rating} onChange={e => {
                            const list = [...testimonials]; list[idx].rating = Number(e.target.value); setTestimonials(list);
                          }} />
                       </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full border-dashed" onClick={() => setTestimonials([...testimonials, { name: "", course: "", text: "", rating: 5, avatar: "" }])}>
                   <Plus className="mr-2 h-4 w-4" /> Add Testimonial
                </Button>
               </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

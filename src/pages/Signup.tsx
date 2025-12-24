import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, GraduationCap, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantProvider";

// Firebase
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// Helpers
function slugify(text: string) {
  return text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
}

export default function Signup() {
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get("role");
  const [role, setRole] = useState<"educator" | "student">(roleParam === "student" ? "student" : "educator");

  const navigate = useNavigate();
  const { tenant, tenantSlug, isTenantDomain } = useTenant();

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Form States
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [coachingName, setCoachingName] = useState("");
  const [phone, setPhone] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) return toast.error("Please agree to the terms");
    
    setLoading(true);

    try {
      if (role === "student") {
        // --- STUDENT SIGNUP LOGIC ---
        if (!isTenantDomain || !tenant) {
          toast.error("Students must sign up on a specific coaching website link.");
          setLoading(false);
          return;
        }

        try {
            // A. TRY NORMAL SIGNUP
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCred.user;
            
            await updateProfile(user, { displayName: fullName });

            // Create new Student Doc
            await setDoc(doc(db, "users", user.uid), {
                email,
                displayName: fullName,
                role: "STUDENT",
                enrolledTenants: [tenantSlug], // Start with array
                tenantSlug: tenantSlug, // Keep legacy field just in case
                createdAt: new Date().toISOString()
            });

            toast.success("Account created! Welcome.");
            navigate("/"); 

        } catch (error: any) {
            // B. HANDLE "EMAIL EXISTS" -> MULTI-TENANT ADDITION
            if (error.code === 'auth/email-already-in-use') {
                
                try {
                    // 1. Try to Login with the provided password
                    const userCred = await signInWithEmailAndPassword(auth, email, password);
                    const user = userCred.user;

                    // 2. Check if they are a student
                    const userDocRef = doc(db, "users", user.uid);
                    const userDoc = await getDoc(userDocRef);

                    if (userDoc.exists() && userDoc.data().role === "STUDENT") {
                        
                        // 3. Add this tenant to their list
                        await updateDoc(userDocRef, {
                            enrolledTenants: arrayUnion(tenantSlug) 
                        });
                        
                        toast.success(`Welcome back! You have been enrolled in ${tenant.coachingName || 'this coaching'}.`);
                        navigate("/");
                    } else {
                        throw new Error("This email is registered as an Educator. Cannot join as Student.");
                    }

                } catch (loginError: any) {
                    if (loginError.code === 'auth/wrong-password') {
                        throw new Error("You already have an account, but the password entered is incorrect. Please Login.");
                    }
                    throw loginError; 
                }
            } else {
                throw error; // Throw other errors normally
            }
        }
        
      } else {
        // --- EDUCATOR SIGNUP (Unchanged) ---
        if (!coachingName) throw new Error("Coaching Name is required");

        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;
        const generatedSlug = slugify(coachingName) + "-" + Math.floor(1000 + Math.random() * 9000);

        await updateProfile(user, { displayName: fullName });

        await setDoc(doc(db, "users", user.uid), {
            email,
            displayName: fullName,
            role: "EDUCATOR",
            phone,
            tenantSlug: generatedSlug,
            coachingName,
            createdAt: new Date().toISOString()
        });

        await setDoc(doc(db, "educators", user.uid), {
            email,
            coachingName,
            slug: generatedSlug,
            websiteConfig: {}
        });
        
        toast.success("Academy created!");
        window.location.href = `http://${generatedSlug}.localhost:5173/dashboard`;
      }

    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  // ... (JSX is the same as before, no changes needed) ...
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left Side - Form */}
      <div className="flex items-center justify-center p-8 bg-background">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md space-y-8"
        >
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">Create Account</h1>
            <p className="text-muted-foreground mt-2">
              {role === "educator" ? "Start your digital coaching journey" : "Join to start learning"}
            </p>
          </div>

          {!isTenantDomain && (
            <div className="bg-muted p-1 rounded-lg grid grid-cols-2">
              <button
                onClick={() => setRole("educator")}
                className={`py-2 text-sm font-medium rounded-md transition-all ${
                  role === "educator" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                As Educator
              </button>
              <button
                onClick={() => setRole("student")}
                className={`py-2 text-sm font-medium rounded-md transition-all ${
                  role === "student" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                As Student
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input 
                placeholder="John Doe" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required 
              />
            </div>

            {role === "educator" && (
              <>
                <div className="space-y-2">
                  <Label>Coaching Name</Label>
                  <Input 
                    placeholder="Ex: Zenith Academy" 
                    value={coachingName}
                    onChange={(e) => setCoachingName(e.target.value)}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input 
                    placeholder="+91 98765 43210" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required 
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email" 
                placeholder="john@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
            </div>

            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="terms" checked={agreed} onCheckedChange={(c) => setAgreed(c as boolean)} />
              <label htmlFor="terms" className="text-sm text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                I agree to the <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
              </label>
            </div>

            <Button type="submit" className="w-full gradient-bg text-white" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {role === "educator" ? "Get Started" : "Join Now"}
              {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>
          
          <div className="text-center text-sm">
             Already have an account?{" "}
             <Link to={`/login?role=${role}`} className="font-medium text-primary hover:underline">
               Log in
             </Link>
          </div>
        </motion.div>
      </div>

      {/* Right Side - Visuals */}
      <div className="hidden lg:flex relative overflow-hidden bg-muted">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />
        <div className="relative z-10 flex flex-col items-center justify-center h-full p-12 text-center">
            {role === "educator" ? (
                <>
                  <Building2 className="h-20 w-20 text-primary mb-6" />
                  <h2 className="text-3xl font-bold mb-4">Build Your Brand</h2>
                  <p className="text-lg text-muted-foreground max-w-md">
                    Create your own white-labeled coaching website in minutes. Manage students, tests, and content all in one place.
                  </p>
                </>
            ) : (
                <>
                  <GraduationCap className="h-20 w-20 text-primary mb-6" />
                  <h2 className="text-3xl font-bold mb-4">Master Your Subjects</h2>
                  <p className="text-lg text-muted-foreground max-w-md">
                    Join top educators, access premium course material, and track your progress with advanced analytics.
                  </p>
                </>
            )}
        </div>
      </div>
    </div>
  );
}

import { motion } from "framer-motion";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, GraduationCap, Building2 } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantProvider";

export default function Login() {
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get("role");
  const [role, setRole] = useState<"educator" | "student">(
    roleParam === "student" ? "student" : "educator"
  );
  
  const navigate = useNavigate();
  const { tenant, tenantSlug, isTenantDomain } = useTenant();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return toast.error("Please enter email and password");

    setLoading(true);

    try {
      // 1. Firebase Auth Login
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const user = userCred.user;

      // 2. Fetch User Data
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        throw new Error("User record not found.");
      }

      const userData = userDoc.data();

      // 3. Validation Logic
      if (role === "student") {
        // A. Verify Role
        if (userData.role !== "STUDENT") {
           throw new Error("This email is registered as an Educator. Please switch tabs.");
        }
        
        // B. Verify Enrollment (The Multi-Tenant Check)
        if (isTenantDomain) {
           // Get array (or empty array)
           const enrolledList: string[] = userData.enrolledTenants || [];
           // Get legacy string (for old users)
           const legacyTenant = userData.tenantSlug;
           
           // Check: Is current website inside their list OR matches their old string?
           // We use 'as string' to satisfy TS because we know tenantSlug exists if isTenantDomain is true
           const isEnrolled = enrolledList.includes(tenantSlug as string) || legacyTenant === tenantSlug;
           
           if (!isEnrolled) {
             throw new Error("You are not registered with this coaching institute. Please Sign Up first.");
           }
        } else {
             // Block login on main domain (univ.live) for students? 
             // Optional: You can allow it if you have a "Student Dashboard" on main site.
             // For now, let's block to avoid confusion.
             throw new Error("Students must login from their specific coaching website URL.");
        }

        navigate("/"); // Go to Student Home

      } else {
        // --- EDUCATOR LOGIN ---
        if (userData.role !== "EDUCATOR" && userData.role !== "ADMIN") {
           throw new Error("This email is registered as a Student.");
        }
        navigate("/dashboard");
      }
      
      toast.success("Welcome back!");
      navigate("/student");

    } catch (error: any) {
      console.error("Login error:", error);
      let msg = "Failed to login";
      
      if (error.code === 'auth/invalid-credential') msg = "Invalid email or password";
      else if (error.code === 'auth/user-not-found') msg = "Account not found";
      else if (error.code === 'auth/wrong-password') msg = "Incorrect password";
      else msg = error.message;
      
      toast.error(msg);
      // Optional: Sign out if validation failed logic but auth succeeded
      auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
       {/* Left Side - Form */}
      <div className="flex items-center justify-center p-8 bg-background">
        <motion.div 
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           className="w-full max-w-md space-y-8"
        >
          <div className="text-center">
             <h1 className="text-3xl font-bold tracking-tight">Welcome Back</h1>
             <p className="text-muted-foreground mt-2">
               {isTenantDomain && tenant 
                  ? `Login to ${tenant.coachingName}` 
                  : "Login to your account"}
             </p>
          </div>

          {/* Role Toggle Tabs - Only show on Main Domain to reduce confusion */}
          {isTenantDomain && (
             <div className="grid grid-cols-2 gap-2 bg-muted p-1 rounded-lg">
               <button
                 onClick={() => setRole("educator")}
                 className={`py-2 text-sm font-medium rounded-md transition-all ${role === "educator" ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
               >
                 Educator
               </button>
               <button
                 onClick={() => setRole("student")}
                 className={`py-2 text-sm font-medium rounded-md transition-all ${role === "student" ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
               >
                 Student
               </button>
             </div>
          )}

       



          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="name@example.com"
                required 
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
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

            <Button type="submit" className="w-full gradient-bg text-white" disabled={loading}>
              {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to={`/signup?role=${role}`} className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right Side - Visuals */}
      <div className="hidden lg:flex relative overflow-hidden bg-muted">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />
        <div className="relative z-10 flex flex-col items-center justify-center h-full p-12 text-center">
            {role === "educator" ? (
                <>
                  <Building2 className="h-20 w-20 text-primary mb-6" />
                  <h2 className="text-3xl font-bold mb-4">Manage Your Institute</h2>
                  <p className="text-lg text-muted-foreground max-w-md">
                    Track performance, manage courses, and grow your coaching business.
                  </p>
                </>
            ) : (
                <>
                  <GraduationCap className="h-20 w-20 text-primary mb-6" />
                  <h2 className="text-3xl font-bold mb-4">Continue Learning</h2>
                  <p className="text-lg text-muted-foreground max-w-md">
                    Access your courses, track your progress, and ace your exams.
                  </p>
                </>
            )}
        </div>
      </div>
    </div>
  );
}

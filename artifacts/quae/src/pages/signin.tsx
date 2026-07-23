import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useSignIn, useSignUp, useForgotPassword } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Film, Copy, Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import emailjs from "@emailjs/browser";

const EMAILJS_SERVICE_ID = "service_307mtzs";
const EMAILJS_TEMPLATE_ID = "template_18dhhtk";
const EMAILJS_WELCOME_TEMPLATE_ID = "template_welcome";
const EMAILJS_PUBLIC_KEY = "1Bes-WPxtm1iB9jmn";

export default function SignIn() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const signInMutation = useSignIn();
  const signUpMutation = useSignUp();
  const forgotPasswordMutation = useForgotPassword();

  const handleCopyTempPassword = () => {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await signInMutation.mutateAsync({ data: { email, password } });
      login(res.token, res.user);
      setLocation("/studio");
    } catch (err: any) {
      toast({
        title: "Sign in failed",
        description: err.message || "Invalid credentials",
        variant: "destructive",
      });
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await signUpMutation.mutateAsync({ data: { email, password, name } });
      login(res.token, res.user);
      // Send welcome email in background — don't block signup if it fails
      emailjs
        .send(
          EMAILJS_SERVICE_ID,
          EMAILJS_WELCOME_TEMPLATE_ID,
          { to_email: email, to_name: name || "there" },
          EMAILJS_PUBLIC_KEY
        )
        .catch(() => {/* silently ignore */});
      setLocation("/studio");
    } catch (err: any) {
      toast({
        title: "Sign up failed",
        description: err.message || "Could not create account",
        variant: "destructive",
      });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Email required", description: "Please enter your email address first." });
      return;
    }
    try {
      const res = await forgotPasswordMutation.mutateAsync({ data: { email } });
      // Show temp password in a persistent dialog
      setTempPassword(res.tempPassword);
      // Also attempt to email it in background
      emailjs
        .send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          { to_email: email, temp_password: res.tempPassword, new_password: res.tempPassword },
          EMAILJS_PUBLIC_KEY
        )
        .catch(() => {/* silently ignore */});
    } catch (err: any) {
      toast({
        title: "Reset failed",
        description: err.message || "Could not send reset email",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {/* Temp Password Dialog — stays open until user dismisses it */}
      <Dialog open={!!tempPassword} onOpenChange={(open) => { if (!open) setTempPassword(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Your temporary password</DialogTitle>
            <DialogDescription>
              Copy this and use it to sign in. Change your password in settings afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded-md bg-secondary px-4 py-3 text-lg font-mono font-bold tracking-widest text-white text-center select-all">
              {tempPassword}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopyTempPassword}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-1">
            We also emailed this to <strong>{email}</strong>
          </p>
          <Button className="w-full mt-2" onClick={() => setTempPassword(null)}>
            Got it — Sign In
          </Button>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-2xl tracking-tight text-white mb-8 hover:opacity-80 transition-opacity">
          <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center">
            <Film className="h-5 w-5 text-white" />
          </div>
          Quae.ai
        </Link>

        <Card className="w-full max-w-md border-white/10 shadow-xl shadow-black/50">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 p-1 bg-secondary/50 rounded-t-xl rounded-b-none border-b border-border">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <CardHeader>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Enter your email and password to access your studio.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full mt-4" disabled={signInMutation.isPending}>
                    {signInMutation.isPending ? <Spinner className="mr-2" /> : null}
                    Sign In
                  </Button>
                </form>
              </CardContent>
            </TabsContent>

            <TabsContent value="signup">
              <CardHeader>
                <CardTitle>Create an account</CardTitle>
                <CardDescription>Start creating professional video ads in minutes.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name-signup">Full Name (optional)</Label>
                    <Input
                      id="name-signup"
                      type="text"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-signup">Email</Label>
                    <Input
                      id="email-signup"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-signup">Password</Label>
                    <Input
                      id="password-signup"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <Button type="submit" className="w-full mt-4" disabled={signUpMutation.isPending}>
                    {signUpMutation.isPending ? <Spinner className="mr-2" /> : null}
                    Create Account
                  </Button>
                </form>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </>
  );
}

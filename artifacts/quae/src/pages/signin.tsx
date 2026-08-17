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
import { Copy, Check, KeyRound } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import emailjs from "@emailjs/browser";
import { authenticationDestination } from "@/lib/campaign-templates";

const EMAILJS_SERVICE_ID = "service_307mtzs";
const EMAILJS_TEMPLATE_ID = "template_18dhhtk";
const EMAILJS_WELCOME_TEMPLATE_ID = "template_welcome";
const EMAILJS_PUBLIC_KEY = "1Bes-WPxtm1iB9jmn";

export default function SignIn() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const destination = authenticationDestination(window.location.search);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  // New-password step inside the reset dialog
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

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
      setLocation(destination);
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
      setLocation(destination);
    } catch (err: any) {
      toast({
        title: "Sign up failed",
        description: err.message || "Could not create account",
        variant: "destructive",
      });
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Email required", description: "Enter your email address above first." });
      return;
    }
    setForgotLoading(true);
    try {
      const res = await forgotPasswordMutation.mutateAsync({ data: { email } });
      setTempPassword(res.tempPassword);
      setNewPassword("");
      setNewPasswordConfirm("");
      emailjs
        .send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
          { to_email: email, temp_password: res.tempPassword, new_password: res.tempPassword },
          EMAILJS_PUBLIC_KEY)
        .catch(() => {});
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message || "Could not reset password", variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSetNewPassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, currentPassword: tempPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set new password");
      login(data.token, data.user);
      setTempPassword(null);
      setLocation(destination);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <>
      {/* Password Reset Dialog */}
      <Dialog open={!!tempPassword} onOpenChange={(open) => { if (!open) { setTempPassword(null); setNewPassword(""); setNewPasswordConfirm(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Reset Your Password
            </DialogTitle>
            <DialogDescription>
              A temporary password was generated. Set a new password below to get back in.
            </DialogDescription>
          </DialogHeader>

          {/* Temp password row */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Temporary password</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-secondary px-3 py-2 text-base font-mono font-bold tracking-widest text-white text-center select-all">
                {tempPassword}
              </code>
              <Button variant="outline" size="icon" onClick={handleCopyTempPassword} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Also emailed to <strong>{email}</strong></p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">Set a new password</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* New password fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New password</Label>
              <Input
                id="new-pw"
                type="password"
                placeholder="Min. 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <Input
                id="confirm-pw"
                type="password"
                placeholder="Repeat new password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSetNewPassword(); }}
              />
            </div>
            <Button className="w-full font-semibold" onClick={handleSetNewPassword} disabled={changingPassword || !newPassword}>
              {changingPassword ? <Spinner className="mr-2 h-4 w-4" /> : null}
              Set New Password & Sign In
            </Button>
          </div>

          {/* Fallback */}
          <button
            className="text-xs text-muted-foreground hover:text-white transition-colors text-center w-full mt-1"
            onClick={() => { setPassword(tempPassword ?? ""); setTempPassword(null); }}
          >
            Skip — I'll sign in with the temp password
          </button>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-2xl tracking-tight text-white mb-8 hover:opacity-80 transition-opacity">
          <img src="/images/logo-icon.png" alt="Quae.ai" className="h-10 w-10 rounded-lg object-cover" />
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
                        disabled={forgotLoading}
                        className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
                      >
                        {forgotLoading && <Spinner className="h-3 w-3" />}
                        {forgotLoading ? "Sending…" : "Forgot password?"}
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

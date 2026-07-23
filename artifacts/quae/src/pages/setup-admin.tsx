import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ShieldCheck, Film, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function SetupAdmin() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/auth/setup-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, message: data.error || "Something went wrong" });
      } else {
        setResult({ success: true, message: data.message || "You are now an admin!" });
        // Auto-login with the returned token so they land on /admin instantly
        if (data.token && data.user) {
          login(data.token, data.user);
          setTimeout(() => setLocation("/admin"), 1500);
        }
      }
    } catch {
      setResult({ success: false, message: "Network error — please try again" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Link href="/" className="flex items-center gap-2 font-bold text-2xl tracking-tight text-white mb-8 hover:opacity-80 transition-opacity">
        <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center">
          <Film className="h-5 w-5 text-white" />
        </div>
        Quae.ai
      </Link>

      <Card className="w-full max-w-md border-white/10 shadow-xl shadow-black/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Admin Setup
          </CardTitle>
          <CardDescription>
            Sign in with your account credentials to grant yourself admin access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className={`flex flex-col items-center gap-4 py-6 text-center ${result.success ? "text-green-400" : "text-destructive"}`}>
              {result.success
                ? <CheckCircle2 className="h-12 w-12" />
                : <AlertCircle className="h-12 w-12" />
              }
              <p className="font-semibold text-white">{result.message}</p>
              {result.success ? (
                <p className="text-sm text-muted-foreground">Redirecting you to the admin panel…</p>
              ) : (
                <Button variant="outline" onClick={() => setResult(null)}>Try again</Button>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-email">Your account email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Your account password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full font-semibold" disabled={loading}>
                {loading ? <Spinner className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Make Me Admin
              </Button>
              <p className="text-xs text-center text-muted-foreground pt-1">
                Already an admin?{" "}
                <Link href="/signin" className="text-primary hover:underline">Sign in here</Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

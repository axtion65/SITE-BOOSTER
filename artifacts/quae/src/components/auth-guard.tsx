import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { protectedSignInUrl } from "@/lib/campaign-templates";

function SessionRecovery({ retry, isRetrying }: { retry: () => void; isRetrying: boolean }) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-6">
      <div className="max-w-md space-y-4 text-center">
        <div role="alert" className="space-y-2">
          <h1 className="text-xl font-semibold">We couldn’t reconnect to your account</h1>
          <p className="text-sm text-muted-foreground">
            Check your internet connection and try again. Your sign-in has been kept.
          </p>
        </div>
        <button
          type="button"
          onClick={retry}
          disabled={isRetrying}
          aria-busy={isRetrying}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {isRetrying ? "Reconnecting…" : "Try again"}
        </button>
      </div>
    </main>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, token, isLoading, isSessionError, isRetryingSession, retrySession } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !token) {
      setLocation(protectedSignInUrl(window.location.pathname, window.location.search));
    }
  }, [isLoading, token, setLocation]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!user) {
    return token && isSessionError
      ? <SessionRecovery retry={retrySession} isRetrying={isRetryingSession} />
      : null;
  }

  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, token, isLoading, isSessionError, isRetryingSession, retrySession } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!token) {
        setLocation("/signin");
      } else if (user && !user.isAdmin) {
        setLocation("/studio");
      }
    }
  }, [isLoading, token, user, setLocation]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!user) {
    return token && isSessionError
      ? <SessionRecovery retry={retrySession} isRetrying={isRetryingSession} />
      : null;
  }

  if (!user.isAdmin) {
    return null;
  }

  return <>{children}</>;
}

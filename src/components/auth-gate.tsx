import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { Logo } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { activateUser, clearActiveUser } from "@/lib/store";

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      setUser(next);
      setLoading(false);
      if (next) {
        void activateUser(next.id);
      } else {
        clearActiveUser();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const signIn = async () => {
    if (!supabase) return;
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      toast.error("Google sign-in failed");
    }
  };
  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!supabaseConfigured)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-5">
        <div className="card-surface w-full max-w-lg space-y-4 p-6">
          <Logo />
          <h1 className="text-2xl font-bold">Finish setting up MUeRA login</h1>
          <p className="text-sm text-muted-foreground">
            Google authentication and private cloud storage are included in this project, but they
            need your Supabase project credentials. Add <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> to your deployment environment, then run the SQL in{" "}
            <code>supabase/schema.sql</code>.
          </p>
          <p className="text-sm">
            No user data is sent to a database until you configure your own Supabase project.
          </p>
        </div>
      </div>
    );
  if (!user)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-5">
        <div className="card-surface w-full max-w-md space-y-5 p-7">
          <Logo />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Your personal study space
            </p>
            <h1 className="text-3xl font-bold">Welcome to MUeRA</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to keep your timetable, tasks, attendance and notes private to your account.
            </p>
          </div>
          <Button className="w-full" onClick={signIn}>
            <GoogleMark /> Continue with Google
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Your account data is separated from other users.
          </p>
        </div>
      </div>
    );
  return (
    <>
      {children}
      <div className="fixed right-3 top-3 z-50 flex items-center gap-2 rounded-full border bg-card/95 px-3 py-1.5 shadow-sm">
        <span className="max-w-36 truncate text-xs text-muted-foreground">{user.email}</span>
        <button
          aria-label="Sign out"
          title="Sign out"
          onClick={signOut}
          className="rounded-full p-1 hover:bg-muted"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="mr-2 h-4 w-4">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 3.56 13.22l7.98 6.19C13.43 13.72 18.24 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.96 46.98 31.9 46.98 24.55Z"
      />
      <path
        fill="#FBBC05"
        d="M11.54 28.59A14.4 14.4 0 0 1 10.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 1 24c0 3.87.93 7.52 2.56 10.78l7.98-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.14 1.44-4.88 2.3-8.17 2.3-5.76 0-10.57-4.22-12.46-9.91l-7.98 6.19C6.51 43.62 14.62 48 24 48Z"
      />
    </svg>
  );
}

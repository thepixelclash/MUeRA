import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  MessageCircle,
  ScanLine,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { getState, hydrate, useStore } from "@/lib/store";
import { toast } from "sonner";
import { AuthGate } from "@/components/auth-gate";

const NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/scan", label: "Scanner", icon: ScanLine },
  { to: "/planner", label: "Planner", icon: Sparkles },
  { to: "/learn", label: "Learn", icon: BookOpen },
  { to: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { to: "/assistant", label: "Assistant", icon: MessageCircle },
  { to: "/connect", label: "Connect", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-sidebar-primary" />
        <path
          d="M7 23V10l9 8 9-8v13"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-sidebar"
        />
        <circle cx="25" cy="7" r="2.5" className="fill-chart-4" />
      </svg>
      <span
        className={`font-display text-xl font-bold tracking-tight ${light ? "text-sidebar-foreground" : "text-primary"}`}
      >
        MU<span className="font-medium italic">e</span>RA
      </span>
    </div>
  );
}

function useReminders() {
  useEffect(() => {
    const fired = new Set<string>();
    const tick = () => {
      const now = Date.now();
      for (const t of getState().tasks) {
        if (t.done || t.reminderMin == null || !t.time) continue;
        const at = new Date(`${t.date}T${t.time}`).getTime() - t.reminderMin * 60000;
        if (now >= at && now - at < 60000 && !fired.has(t.id + at)) {
          fired.add(t.id + at);
          const body = `${t.subject} · ${t.date} ${t.time}`;
          toast(`Reminder: ${t.title}`, { description: body });
          if (typeof Notification !== "undefined" && Notification.permission === "granted")
            new Notification(`MUeRA: ${t.title}`, { body });
        }
      }
    };
    const id = setInterval(tick, 20000);
    tick();
    return () => clearInterval(id);
  }, []);
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const s = useStore();
  useEffect(() => {
    hydrate();
  }, []);
  useReminders();
  const isDemo = s.tasks.some((t) => t.demo) || s.subjects.some((x) => x.demo);

  return (
    <AuthGate>
      <div className="min-h-screen md:flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar p-4 md:flex">
          <Logo light />
          <p className="mt-1 text-xs text-sidebar-foreground/70">
            Plan smarter. Learn easier. Stay ahead.
          </p>
          <nav className="mt-8 flex flex-1 flex-col gap-1">
            {NAV.map((n) => {
              const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}
                >
                  <n.icon className="h-4 w-4" /> {n.label}
                </Link>
              );
            })}
          </nav>
          <p className="text-xs text-sidebar-foreground/60">AI requests this device: {s.aiCalls}</p>
        </aside>
        <header className="flex items-center justify-between bg-sidebar px-4 py-3 md:hidden">
          <Logo light />
        </header>
        <main className="flex-1 pb-28 md:pb-0">
          {isDemo && (
            <div className="bg-secondary px-4 py-2 text-center text-xs text-secondary-foreground">
              You're viewing sample demo data. Remove it anytime in{" "}
              <Link to="/settings" className="font-semibold underline">
                Settings
              </Link>
              .
            </div>
          )}
          <div className="mx-auto max-w-6xl p-4 md:p-8">{children}</div>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card md:hidden">
          {NAV.map((n) => {
            const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <n.icon className="h-5 w-5" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </AuthGate>
  );
}

export function PageHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

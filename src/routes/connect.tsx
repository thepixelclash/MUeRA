import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  findByStudentId,
  getMyProfile,
  listDirectory,
  listMessages,
  listRequests,
  optIn,
  optOut,
  renameStudent,
  respondToRequest,
  sendMessage,
  sendRequestByStudentId,
  type ChatMessage,
  type ConnectRequest,
  type DirectoryEntry,
  type MyProfile,
} from "@/lib/connect";

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { title: "Student Connect — MUeRA" },
      { name: "description", content: "Opt-in 1:1 chat between students, with message requests." },
    ],
  }),
  component: ConnectPage,
});

function fullNameFromMeta(meta: Record<string, unknown> | undefined): string {
  if (!meta) return "";
  const pick = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string).trim() : "");
  const raw = (pick("full_name") || pick("name") || pick("given_name"))
    .replace(/[<>&"]/g, "")
    .slice(0, 60);
  // Google sometimes stores the name in ALL CAPS; show it in title case instead.
  if (raw && !/[a-z]/.test(raw))
    return raw.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return raw;
}

function ConnectPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [myUid, setMyUid] = useState("");
  const [defaultName, setDefaultName] = useState("");
  const [requests, setRequests] = useState<ConnectRequest[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);

  const refreshLists = useCallback(async () => {
    try {
      const [reqs, dir] = await Promise.all([listRequests(), listDirectory()]);
      setRequests(reqs);
      setDirectory(dir);
    } catch {
      /* quiet poll failures */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const sess = await supabase?.auth.getSession();
        const user = sess?.data.session?.user;
        setMyUid(user?.id ?? "");
        setDefaultName(fullNameFromMeta(user?.user_metadata));
        setProfile(await getMyProfile());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load Student Connect.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const optedIn = Boolean(profile?.opted_in);

  useEffect(() => {
    if (!optedIn) return;
    void refreshLists();
    const id = setInterval(() => void refreshLists(), 6000);
    return () => clearInterval(id);
  }, [optedIn, refreshLists]);

  if (loading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  if (!optedIn)
    return (
      <OptInCard
        defaultName={profile?.display_name || defaultName}
        onDone={async (name) => {
          const p = await optIn(name);
          setProfile(p);
          toast.success(`Student Connect is on. Your ID is ${p.student_id}.`);
        }}
      />
    );

  if (chatId) {
    const req = requests.find((r) => r.id === chatId);
    if (req)
      return (
        <ChatView
          req={req}
          myUid={myUid}
          onBack={() => {
            setChatId(null);
            void refreshLists();
          }}
        />
      );
  }

  const incoming = requests.filter((r) => r.recipient_id === myUid && r.status === "pending");
  const outgoing = requests.filter((r) => r.sender_id === myUid && r.status !== "accepted");
  const chats = requests.filter((r) => r.status === "accepted");

  return (
    <div className="space-y-6">
      <PageHeader title="Student Connect" sub="Chat 1:1 with other students - only if both of you want to." />
      <IdCard
        profile={profile!}
        onRename={async (name) => {
          await renameStudent(name);
          setProfile({ ...profile!, display_name: name });
          toast.success("Name updated.");
        }}
        onOff={async () => {
          await optOut();
          setProfile({ ...profile!, opted_in: false });
          toast.success("Student Connect is off. You are hidden and can't be messaged.");
        }}
      />
      <FindStudent myId={profile!.student_id} directory={directory.filter((d) => d.student_id !== profile!.student_id)} />
      {incoming.length > 0 && (
        <section className="card-surface space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <MessageCircle className="h-4 w-4 text-primary" /> Message requests ({incoming.length})
          </h2>
          {incoming.map((r) => (
            <div key={r.id} className="rounded-xl border p-3">
              <p className="text-sm font-semibold">
                {r.sender?.display_name ?? "Student"}{" "}
                <span className="font-mono text-xs text-muted-foreground">{r.sender?.student_id ?? ""}</span>
              </p>
              <p className="mt-1 rounded-lg bg-secondary p-2 text-sm">{r.first_message}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    void respondToRequest(r.id, "accepted")
                      .then(() => refreshLists())
                      .then(() => toast.success("Request accepted. You can chat now."))
                      .catch((e) => toast.error(String(e)))
                  }
                >
                  <Check className="h-4 w-4" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void respondToRequest(r.id, "declined")
                      .then(() => refreshLists())
                      .catch((e) => toast.error(String(e)))
                  }
                >
                  <X className="h-4 w-4" /> Decline
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}
      {chats.length > 0 && (
        <section className="card-surface space-y-2 p-4">
          <h2 className="text-sm font-bold">Chats</h2>
          {chats.map((r) => {
            const other = r.sender_id === myUid ? r.recipient : r.sender;
            return (
              <button
                key={r.id}
                onClick={() => setChatId(r.id)}
                className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {(other?.display_name ?? "S").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{other?.display_name ?? "Student"}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {other ? other.student_id : "Paused - they turned off Connect"}
                  </p>
                </div>
              </button>
            );
          })}
        </section>
      )}
      {outgoing.length > 0 && (
        <section className="card-surface space-y-2 p-4">
          <h2 className="text-sm font-bold">Sent requests</h2>
          {outgoing.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
              <span>
                {r.recipient?.display_name ?? "Student"}{" "}
                <span className="font-mono text-xs text-muted-foreground">{r.recipient?.student_id ?? ""}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {r.status === "pending" ? "Waiting for reply" : "Declined"}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function OptInCard({
  defaultName,
  onDone,
}: {
  defaultName: string;
  onDone: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(defaultName), [defaultName]);
  return (
    <div className="space-y-6">
      <PageHeader title="Student Connect" sub="Chat 1:1 with other students - only if both of you want to." />
      <section className="card-surface mx-auto max-w-lg space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-bold">Talk to other students</h2>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Completely optional - turn it off anytime and you disappear from the directory.</span>
          </li>
          <li className="flex gap-2">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              The first message from someone new lands in your{" "}<b>message requests</b>. Chat only
              starts if you accept.
            </span>
          </li>
          <li className="flex gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Other students see only your name and your unique student ID - never your email, tasks
              or documents.
            </span>
          </li>
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="connect-name">Name shown to other students</Label>
          <Input
            id="connect-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <Button
          className="w-full"
          disabled={busy || name.trim().length === 0}
          onClick={() => {
            setBusy(true);
            void onDone(name.trim())
              .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Turn on Student Connect
        </Button>
      </section>
    </div>
  );
}

function IdCard({
  profile,
  onRename,
  onOff,
}: {
  profile: MyProfile;
  onRename: (name: string) => Promise<void>;
  onOff: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.display_name);
  const [confirmOff, setConfirmOff] = useState(false);
  return (
    <section className="card-surface flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void onRename(name.trim()).then(() => setEditing(false));
            }}
          >
            <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="h-8 w-44" />
            <Button size="sm" type="submit">
              Save
            </Button>
          </form>
        ) : (
          <p className="text-sm font-semibold">
            {profile.display_name}{" "}
            <button className="text-xs font-normal text-primary underline" onClick={() => setEditing(true)}>
              edit
            </button>
          </p>
        )}
        <p className="mt-0.5 flex items-center gap-2 font-mono text-lg font-bold tracking-wide text-primary">
          {profile.student_id}
          <button
            aria-label="Copy ID"
            onClick={() => {
              void navigator.clipboard?.writeText(profile.student_id);
              toast.success("ID copied. Share it so friends can message you.");
            }}
          >
            <Copy className="h-4 w-4 text-muted-foreground" />
          </button>
        </p>
        <p className="text-xs text-muted-foreground">Your unique student ID</p>
      </div>
      {confirmOff ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Hide you and block new messages?</span>
          <Button size="sm" variant="destructive" onClick={() => void onOff()}>
            Turn off
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmOff(false)}>
            Keep on
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirmOff(true)}>
          Turn off Connect
        </Button>
      )}
    </section>
  );
}

function FindStudent({ myId, directory }: { myId: string; directory: DirectoryEntry[] }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<DirectoryEntry | null>(null);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setSearched(true);
    setFound(null);
    if (!q.trim()) return;
    try {
      setFound(await findByStudentId(q));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const send = async (target: DirectoryEntry) => {
    if (!message.trim()) return;
    setBusy(true);
    try {
      await sendRequestByStudentId(target.student_id, message.trim());
      toast.success(`Request sent to ${target.display_name}. They must accept before you can chat.`);
      setMessage("");
      setFound(null);
      setQ("");
      setSearched(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-surface space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <Search className="h-4 w-4 text-primary" /> Find a student
      </h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value.toUpperCase());
            setSearched(false);
            setFound(null);
          }}
          placeholder="Enter their ID, e.g. MU-4K7Q2X"
          className="font-mono"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {found && found.student_id !== myId && (
        <div className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-semibold">
            {found.display_name}{" "}
            <span className="font-mono text-xs text-muted-foreground">{found.student_id}</span>
          </p>
          <div className="flex gap-2">
            <Input
              value={message}
              maxLength={2000}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Say hi - this goes to their message requests"
            />
            <Button disabled={busy || !message.trim()} onClick={() => void send(found)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            They see this in their message requests first. Chat opens only if they accept.
          </p>
        </div>
      )}
      {found && found.student_id === myId && (
        <p className="text-sm text-muted-foreground">
          That&apos;s your own ID. Share it with a friend so they can send you a message request.
        </p>
      )}
      {searched && !found && q.trim() && (
        <p className="text-sm text-muted-foreground">
          No opted-in student with that ID. Check the ID with your friend.
        </p>
      )}
      {directory.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold text-muted-foreground">
            Students who turned on Connect ({directory.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {directory.map((d) => (
              <div key={d.student_id} className="flex items-center justify-between rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{d.display_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{d.student_id}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQ(d.student_id);
                    setFound(d);
                    setSearched(true);
                  }}
                >
                  Message
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ChatView({
  req,
  myUid,
  onBack,
}: {
  req: ConnectRequest;
  myUid: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const other = req.sender_id === myUid ? req.recipient : req.sender;

  const load = useCallback(async () => {
    try {
      setMessages(await listMessages(req.id));
    } catch {
      /* quiet poll failures */
    }
  }, [req.id]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [load]);

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await sendMessage(req.id, draft.trim());
      setDraft("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <p className="text-sm font-bold">{other?.display_name ?? "Student"}</p>
          <p className="font-mono text-xs text-muted-foreground">{other?.student_id ?? ""}</p>
        </div>
      </div>
      <section className="card-surface space-y-2 p-4">
        <div className="flex min-h-48 flex-col gap-2">
          <Bubble mine={req.sender_id === myUid} text={req.first_message} at={req.created_at} />
          {messages.map((m) => (
            <Bubble key={m.id} mine={m.sender_id === myUid} text={m.body} at={m.created_at} />
          ))}
        </div>
        {!other && (
          <p className="rounded-lg bg-secondary p-2 text-center text-xs text-muted-foreground">
            This chat is paused because the other student turned off Student Connect. Your history
            stays saved; messaging resumes if they turn it back on.
          </p>
        )}
        <form
          className="flex gap-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Input
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={other ? "Type a message" : "Chat paused"}
            disabled={!other}
          />
          <Button type="submit" disabled={busy || !draft.trim() || !other}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </section>
    </div>
  );
}

function Bubble({ mine, text, at }: { mine: boolean; text: string; at: string }) {
  const time = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div
      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
        mine ? "self-end bg-primary text-primary-foreground" : "self-start bg-secondary"
      }`}
    >
      <p className="whitespace-pre-wrap break-words">{text}</p>
      <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
        {time}
      </p>
    </div>
  );
}

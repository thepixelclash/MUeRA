import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Check, ChevronDown, ChevronUp, ExternalLink, FileUp, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ai, extractPdf, parseJSON, ytLink } from "@/lib/client";
import { setState, uid, useStore, type Doc } from "@/lib/store";
import { PdfOriginal } from "@/components/pdf-original";
import { originalFile } from "@/lib/pdf-original";
import { getActiveUserId } from "@/lib/store";
import { trashDriveFile } from "@/lib/drive";
import { saveFileToDrive } from "@/lib/drive-ui";
import { toast } from "sonner";
import { AiStatus } from "@/components/ai-bits";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "PDF Learning Assistant — MUeRA" },
      {
        name: "description",
        content:
          "Upload lecture notes to get summaries, revision notes, practice quizzes, flashcards and topic videos.",
      },
      { property: "og:title", content: "PDF Learning Assistant — MUeRA" },
      {
        property: "og:description",
        content: "Turn lecture notes into summaries, quizzes and flashcards.",
      },
    ],
  }),
  component: Learn,
});

const MAX_CHARS = 24000;
type Q = { q: string; options: string[]; answer: number; why: string };
type F = { front: string; back: string };

function Learn() {
  const s = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [aiError, setAiError] = useState<{
    msg: string;
    mode: "summary" | "notes" | "quiz" | "flashcards";
  } | null>(null);
  const [pending, setPending] = useState<{
    name: string;
    file?: File;
    pages: string[];
    from: number;
    to: number;
    stack?: string;
  } | null>(null);
  const doc = s.docs.find((d) => d.id === (sel ?? s.docs[0]?.id));
  const [stackOrder, setStackOrder] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("muera:stack-order") ?? "[]");
    } catch {
      return [];
    }
  });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const stacks = [...new Set(s.docs.map((x) => x.stack ?? ""))];
  const ordered = [
    ...stackOrder.filter((n) => stacks.includes(n)),
    ...stacks.filter((n) => !stackOrder.includes(n)),
  ];
  const saveOrder = (next: string[]) => {
    setStackOrder(next);
    try {
      localStorage.setItem("muera:stack-order", JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };
  const moveStack = (stk: string, dir: -1 | 1) => {
    const i = ordered.indexOf(stk);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[i], next[j]] = [next[j], next[i]];
    saveOrder(next);
  };
  const renameStack = (oldS: string, newS: string) => {
    const ns = newS.trim();
    setState((st) => ({
      docs: st.docs.map((d) => ((d.stack ?? "") === oldS ? { ...d, stack: ns || undefined } : d)),
    }));
    saveOrder([...new Set(ordered.map((n) => (n === oldS ? ns || "" : n)))]);
    setRenaming(null);
  };
  const moveDoc = (id: string, newStack: string) => {
    setState((st) => ({
      docs: st.docs.map((d) => (d.id === id ? { ...d, stack: newStack || undefined } : d)),
    }));
  };

  const onFile = async (f: File) => {
    if (f.type !== "application/pdf") return toast.error("Please upload a PDF.");
    setBusy("Reading PDF on your device…");
    try {
      const pages = await extractPdf(f, (p) => setBusy(`Reading PDF… ${Math.round(p * 100)}%`));
      setBusy("");
      if (!pages.join("").trim())
        return toast.error("This PDF has no selectable text (scanned pages aren't supported yet).");
      setPending({ name: f.name, file: f, pages, from: 1, to: pages.length });
    } catch {
      setBusy("");
      toast.error("Couldn't read this PDF.");
    }
  };
  const confirm = async () => {
    if (!pending) return;
    const text = pending.pages
      .slice(pending.from - 1, pending.to)
      .map((t, i) => `[Page ${pending.from + i}] ${t}`)
      .join("\n");
    const d: Doc = {
      id: uid(),
      name: pending.name,
      pages: pending.to - pending.from + 1,
      text,
      cache: {},
      stack: pending.stack?.trim() ? pending.stack.trim() : undefined,
    };
    const user = getActiveUserId();
    if (!user || !pending.file) return;
    setBusy("Keeping original PDF on this browser...");
    try { await originalFile(user, d.id, pending.file); }
    catch { setBusy(""); toast.error("Couldn't keep the original PDF. Browser storage may be full or unavailable. Document was not added."); return; }
    setBusy("");
    if (getActiveUserId() !== user) return;
    setState((st) => ({ docs: [...st.docs, d] }));
    if (pending.file)
      void saveFileToDrive(pending.file, (id) =>
        setState((st) => ({
          docs: st.docs.map((x) => (x.id === d.id ? { ...x, driveFileId: id } : x)),
        })),
      );
    setSel(d.id);
    setPending(null);
  };

  const run = async (mode: "summary" | "notes" | "quiz" | "flashcards") => {
    if (!doc) return;
    if (doc.cache[mode]) return;
    setAiError(null);
    setBusy("MUeRA is reading your notes…");
    const r = await ai(mode, `Document: ${doc.name}`, doc.text.slice(0, MAX_CHARS));
    setBusy("");
    if (r.error) return setAiError({ msg: r.error, mode });
    if ((mode === "quiz" || mode === "flashcards") && !parseJSON(r.text ?? ""))
      return setAiError({
        msg: "The AI reply couldn't be turned into cards. Nothing was saved.",
        mode,
      });
    setState((st) => ({
      docs: st.docs.map((d) =>
        d.id === doc.id ? { ...d, cache: { ...d.cache, [mode]: r.text ?? "" } } : d,
      ),
    }));
  };

  const pendChars = pending ? pending.pages.slice(pending.from - 1, pending.to).join("").length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning Assistant"
        sub="PDFs are read on your device. Each result is saved, so it only uses AI once."
      >
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <FileUp className="h-4 w-4" /> Upload PDF
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
      </PageHeader>
      <AiStatus
        busy={busy}
        error={aiError?.msg}
        onRetry={aiError ? () => run(aiError.mode) : undefined}
      />

      {pending && (
        <section className="card-surface space-y-3 p-4">
          <p className="text-sm">
            <b>{pending.name}</b> — {pending.pages.length} pages. Choose the pages to study.
          </p>
          <div className="flex items-center gap-2 text-sm">
            Pages{" "}
            <Input
              className="w-20"
              type="number"
              min={1}
              max={pending.pages.length}
              value={pending.from}
              onChange={(e) =>
                setPending({
                  ...pending,
                  from: Math.max(1, Math.min(pending.to, Number(e.target.value))),
                })
              }
            />
            to{" "}
            <Input
              className="w-20"
              type="number"
              min={pending.from}
              max={pending.pages.length}
              value={pending.to}
              onChange={(e) =>
                setPending({
                  ...pending,
                  to: Math.max(
                    pending.from,
                    Math.min(pending.pages.length, Number(e.target.value)),
                  ),
                })
              }
            />
          </div>
          {pendChars > MAX_CHARS && (
            <p className="rounded-lg bg-warning/20 p-2 text-sm">
              This selection is long. To save credits, AI reads only about the first{" "}
              {Math.round((MAX_CHARS / pendChars) * 100)}%. Pick fewer pages (e.g. one chapter) for
              full coverage.
            </p>
          )}
          <div className="flex items-center gap-2 text-sm">
            Stack{" "}
            <Input
              className="w-56"
              list="muera-stacks"
              placeholder="e.g. DSCO notes (optional)"
              value={pending.stack ?? ""}
              onChange={(e) => setPending({ ...pending, stack: e.target.value })}
            />
            <datalist id="muera-stacks">
              {[...new Set(s.docs.map((x) => x.stack).filter(Boolean))].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <p className="text-xs text-muted-foreground">
            Stacks keep your PDFs grouped by subject or topic so you can find them later. Files
            stay in your own Google Drive when Drive saving is on.
          </p>
          <p className="text-xs text-muted-foreground">The original PDF is kept on this browser. Save it to your own Drive for access on other devices. Clearing browser data can remove local copies.</p>
          <Button disabled={!!busy} onClick={() => void confirm()}>Add document</Button>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-4">
        <aside className="space-y-2">
          {ordered.map((stk, idx) => (
            <div key={stk || "(none)"} className="space-y-2">
              <div className="flex items-center gap-1 px-1 pt-2">
                {renaming === stk ? (
                  <>
                    <Input
                      className="h-7 w-40"
                      value={renameVal}
                      placeholder="Stack name (blank = no stack)"
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && renameStack(stk, renameVal)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Save stack name"
                      onClick={() => renameStack(stk, renameVal)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel rename"
                      onClick={() => setRenaming(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {stk
                        ? `${stk} (${s.docs.filter((x) => (x.stack ?? "") === stk).length})`
                        : "No stack"}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move stack up"
                      disabled={idx === 0}
                      onClick={() => moveStack(stk, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move stack down"
                      disabled={idx === ordered.length - 1}
                      onClick={() => moveStack(stk, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Rename stack"
                      onClick={() => {
                        setRenaming(stk);
                        setRenameVal(stk);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              {s.docs.filter((x) => (x.stack ?? "") === stk).map((d) => (
            <div
              key={d.id}
              className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm ${doc?.id === d.id ? "bg-accent" : "bg-card"}`}
            >
              <button
                className="flex flex-1 items-center gap-2 text-left"
                onClick={() => setSel(d.id)}
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                <span className="line-clamp-2">{d.name}</span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete document"
                onClick={() => {
                  if (
                    d.driveFileId &&
                    window.confirm(
                      "Also move the original file in your Google Drive to the trash? Choose Cancel to keep it in Drive.",
                    )
                  )
                    void trashDriveFile(d.driveFileId).catch(() => undefined);
                  setState((st) => ({ docs: st.docs.filter((x) => x.id !== d.id) }));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <select
                className="w-24 shrink-0 rounded-md border bg-background px-1 py-1 text-xs"
                value={d.stack ?? ""}
                aria-label={`Move ${d.name} to another stack`}
                title="Move to another stack"
                onChange={(e) => moveDoc(d.id, e.target.value)}
              >
                {[...new Set([...ordered, d.stack ?? ""])].map((n) => (
                  <option key={n || "(none)"} value={n}>
                    {n || "No stack"}
                  </option>
                ))}
              </select>
              <PdfOriginal key={`${d.id}:${d.driveFileId ?? "local"}`} doc={d} />
            </div>
              ))}
            </div>
          ))}
          {!s.docs.length && <p className="text-sm text-muted-foreground">No documents yet.</p>}
        </aside>
        <div className="lg:col-span-3">
          {doc ? (
            <DocView doc={doc} run={run} busy={!!busy} />
          ) : (
            <p className="text-sm text-muted-foreground">Upload lecture notes to begin.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DocView({
  doc,
  run,
  busy,
}: {
  doc: Doc;
  run: (m: "summary" | "notes" | "quiz" | "flashcards") => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"summary" | "notes" | "quiz" | "flashcards">("summary");
  const content = doc.cache[tab];
  const kw = (doc.cache.summary?.match(/KEYWORDS:\s*(.+)/i)?.[1] ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return (
    <section className="card-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold">{doc.name}</h2>
        <PdfOriginal key={`${doc.id}:${doc.driveFileId ?? "local"}`} doc={doc} />
      </div>
      <p className="text-xs text-muted-foreground">
        {doc.pages} page(s) · results come only from this document
        {doc.stack ? ` · Stack: ${doc.stack}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        {(["summary", "notes", "quiz", "flashcards"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {t === "notes" ? "Revision notes" : t}
            {doc.cache[t] ? " ✓" : ""}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {!content ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Not generated yet.</p>
            <Button className="mt-3" disabled={busy} onClick={() => run(tab)}>
              Generate {tab} (1 AI request)
            </Button>
          </div>
        ) : tab === "quiz" ? (
          <Quiz raw={content} />
        ) : tab === "flashcards" ? (
          <Cards raw={content} />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {content.replace(/KEYWORDS:.*$/im, "")}
          </p>
        )}
      </div>
      {kw.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="text-sm font-semibold">Find videos on these topics (YouTube search)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {kw.map((k) => (
              <a
                key={k}
                href={ytLink(k)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
              >
                {k} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Quiz({ raw }: { raw: string }) {
  const qs = parseJSON<Q[]>(raw);
  const [picked, setPicked] = useState<Record<number, number>>({});
  if (!qs) return <p className="whitespace-pre-wrap text-sm">{raw}</p>;
  return (
    <div className="space-y-4">
      {qs.map((q, i) => (
        <div key={i}>
          <p className="text-sm font-semibold">
            {i + 1}. {q.q}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {q.options.map((o, j) => {
              const p = picked[i];
              const state =
                p == null
                  ? "bg-muted"
                  : j === q.answer
                    ? "bg-success text-success-foreground"
                    : j === p
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-muted opacity-60";
              return (
                <button
                  key={j}
                  disabled={p != null}
                  onClick={() => setPicked({ ...picked, [i]: j })}
                  className={`rounded-lg px-3 py-2 text-left text-sm ${state}`}
                >
                  {o}
                </button>
              );
            })}
          </div>
          {picked[i] != null && <p className="mt-1 text-xs text-muted-foreground">{q.why}</p>}
        </div>
      ))}
      <p className="text-sm font-semibold">
        Score: {Object.entries(picked).filter(([i, j]) => qs[Number(i)].answer === j).length}/
        {qs.length}
      </p>
    </div>
  );
}

function Cards({ raw }: { raw: string }) {
  const cs = parseJSON<F[]>(raw);
  const [flip, setFlip] = useState<Record<number, boolean>>({});
  if (!cs) return <p className="whitespace-pre-wrap text-sm">{raw}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
      {cs.map((c, i) => (
        <button
          key={i}
          onClick={() => setFlip({ ...flip, [i]: !flip[i] })}
          className={`min-h-28 rounded-2xl p-4 text-sm font-medium shadow-soft ${flip[i] ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
        >
          {flip[i] ? c.back : c.front}
        </button>
      ))}
    </div>
  );
}

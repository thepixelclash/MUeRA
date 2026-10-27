import { useState, type ReactNode } from "react";
import { AlertTriangle, FileUp, Sparkles, Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { AiStatus } from "./ai-bits";
import { TimetableReview } from "./timetable-review";
import { readTimetable } from "@/lib/timetable-reader";
import { extractTimetable } from "@/lib/timetable";
import { aiExtractTimetable, type TimetableResult } from "@/lib/timetable-ai";
import { reconnectAndSave, saveFileToDrive, type DriveStatus } from "@/lib/drive-ui";

/**
 * Import a weekly timetable straight from the Calendar: pick the college timetable
 * PDF (or a photo of it), AI reads the class grid, the student reviews the entries,
 * and confirming updates the weekly timetable shown in the calendar. The original
 * file is copied to the student's own Google Drive when that is on in Settings.
 */
export function TimetableImportDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [aiError, setAiError] = useState("");
  const [fileNote, setFileNote] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [schedule, setSchedule] = useState<TimetableResult | null>(null);
  const [reviewVersion, setReviewVersion] = useState(0);
  const [driveId, setDriveId] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveStatus>("off");
  const [driveFile, setDriveFile] = useState<File | null>(null);
  const driveBlocked = driveStatus === "uploading" || driveStatus === "needs-reconnect";

  const runAI = async (t: string) => {
    setAiError("");
    setBusy("AI is reading your timetable…");
    const r = await aiExtractTimetable(t);
    setBusy("");
    if (r.error) return setAiError(r.error);
    setSchedule(r.result ?? null);
    setReviewVersion((v) => v + 1);
  };

  const onFile = async (f: File) => {
    setDriveId(null);
    setDriveStatus("off");
    setDriveFile(f);
    setFileNote("");
    setAiError("");
    setSchedule(null);
    setText("");
    setFileName(f.name);
    setBusy("Reading document…");
    try {
      const t = (await readTimetable(f, setBusy)).trim();
      setText(t);
      if (t) {
        void saveFileToDrive(f, setDriveId, setDriveStatus);
        await runAI(t);
      } else {
        setFileNote(
          "No readable text found. Try a sharper image, a text-based PDF, or enter classes manually.",
        );
      }
    } catch {
      setFileNote(
        "Couldn't read this document. Check your connection for the first OCR download, retry with a clear image, or paste the text.",
      );
    } finally {
      setBusy("");
    }
  };

  const reset = () => {
    setBusy("");
    setAiError("");
    setFileNote("");
    setText("");
    setFileName("");
    setSchedule(null);
    setDriveId(null);
    setDriveStatus("off");
    setDriveFile(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import timetable from PDF</DialogTitle>
          <DialogDescription>
            Upload your class timetable PDF and AI will fill in your weekly classes. You check
            everything before it is saved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center hover:bg-muted">
            <FileUp className="h-8 w-8 text-primary" />
            <span className="font-semibold">
              {fileName || "Upload timetable PDF or image"}
            </span>
            <span className="text-xs text-muted-foreground">
              The original file is copied to your Google Drive when Drive saving is on
            </span>
            <input
              type="file"
              accept="application/pdf,image/*"
              disabled={!!busy}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {driveStatus !== "off" && driveStatus !== "saved" && (
            <p className="flex flex-wrap items-center gap-2 rounded-lg bg-warning/20 p-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {driveStatus === "uploading" &&
                "Saving this file to your Google Drive… Saving is paused until it finishes."}
              {driveStatus === "needs-reconnect" &&
                "Google Drive needs to be reconnected before this file can be saved. Saving is paused until you reconnect."}
              {driveStatus === "failed" &&
                "The file was not saved to Google Drive. Anything you save now will not link to a Drive file."}
              {(driveStatus === "needs-reconnect" || driveStatus === "failed") && driveFile && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void reconnectAndSave(driveFile, setDriveId, setDriveStatus)}
                >
                  Reconnect and retry Drive save
                </Button>
              )}
            </p>
          )}
          {fileNote && (
            <p className="flex gap-2 rounded-lg bg-warning/20 p-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {fileNote}
            </p>
          )}
          {text && (
            <Textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Extracted timetable text"
            />
          )}
          {text && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!text.trim() || !!busy}
                onClick={() => void runAI(text)}
              >
                <Sparkles className="h-4 w-4" /> Extract with AI (1 request)
              </Button>
              <Button
                variant="ghost"
                disabled={!text.trim() || !!busy}
                onClick={() => {
                  const r = extractTimetable(text);
                  setSchedule(r);
                  setReviewVersion((v) => v + 1);
                  if (!r.entries.length)
                    setFileNote(
                      "No class times could be read confidently. Detected subjects are retained below. Add or correct classes manually, or retry with a clearer document.",
                    );
                }}
              >
                <Wand2 className="h-4 w-4" /> Quick extract (free)
              </Button>
            </div>
          )}
          <AiStatus busy={busy} error={aiError} onRetry={text ? () => void runAI(text) : undefined} />
          <p className="text-xs text-muted-foreground">
            Files are read on your device. The extracted text is sent to our AI provider (Groq) to
            read the class grid. If saving to Google Drive is on in Settings, the original file is
            copied to your Drive as soon as you add it. Your weekly timetable is updated only when
            you confirm below.
          </p>
          {schedule && (
            <TimetableReview
              key={reviewVersion}
              result={schedule}
              sourceFileId={driveId ?? undefined}
              saveBlocked={driveBlocked}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { actions, setState, useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useInstall } from "@/lib/pwa";
import { connectDrive, driveConfigured, driveEnabled, setDriveEnabled } from "@/lib/drive";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Settings & Privacy — MUeRA" },
      { name: "description", content: "Manage demo data, reminders and delete your MUeRA data." },
      { property: "og:title", content: "Settings & Privacy — MUeRA" },
      { property: "og:description", content: "Your data stays on your device." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const s = useStore();
  const [perm, setPerm] = useState("unsupported");
  const pwa = useInstall();
  const [driveOn, setDriveOn] = useState(false);
  useEffect(() => setDriveOn(driveEnabled()), []);
  const toggleDrive = async () => {
    if (driveOn) {
      setDriveEnabled(false);
      setDriveOn(false);
      return;
    }
    try {
      await connectDrive();
      setDriveEnabled(true);
      setDriveOn(true);
      toast.success("New uploads will be saved to your Google Drive.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't connect Google Drive.");
    }
  };
  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings & Privacy" />
      <section className="space-y-2">
        <h2 className="text-sm font-bold">Install MUeRA</h2>
        {pwa.installed ? (
          <p className="text-sm text-muted-foreground">MUeRA is installed on this device.</p>
        ) : pwa.canInstall ? (
          <Button onClick={() => void pwa.install()}>Install app</Button>
        ) : pwa.ios ? (
          <p className="text-sm text-muted-foreground">
            On iPhone or iPad: tap Share, then “Add to Home Screen”.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Use your browser menu: “Install app” or “Add to Home screen”. Some browsers only offer
            it after you have used the site for a moment.
          </p>
        )}
      </section>
      {driveConfigured() && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Google Drive</h2>
          <p className="text-sm text-muted-foreground">
            Keep the PDFs you upload in your own Google Drive (a “MUeRA uploads” folder). MUeRA can
            only see files it saved. The text MUeRA reads from them and the AI answers it saves are
            kept in your MUeRA account, not in Drive. Deleting a document here keeps the Drive file
            unless you choose to trash it.
          </p>
          <Button variant={driveOn ? "outline" : "default"} onClick={() => void toggleDrive()}>
            {driveOn ? "Stop saving to Drive" : "Save uploads to my Drive"}
          </Button>
        </section>
      )}
      <section className="space-y-2">
        <Label htmlFor="attendance-target">Attendance target (%)</Label>
        <Input
          id="attendance-target"
          aria-label="Attendance target"
          className="w-40"
          type="number"
          min={1}
          max={100}
          placeholder="75"
          value={s.settings.threshold}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value && n >= 1 && n <= 100)
              setState((st) => ({ settings: { ...st.settings, threshold: n } }));
          }}
        />
      </section>
      <section className="card-surface space-y-2 p-4">
        <h2 className="font-bold">Reminders</h2>
        <p className="text-sm text-muted-foreground">
          Reminders pop up while MUeRA is open in a tab. Browser notifications need your permission
          and do not arrive when the app is fully closed.
        </p>
        <p className="text-sm">
          Status: <b>{perm}</b>
        </p>
        <Button
          disabled={perm === "unsupported" || perm === "granted"}
          onClick={async () => setPerm(await Notification.requestPermission())}
        >
          Enable browser notifications
        </Button>
      </section>
      <section className="card-surface space-y-2 p-4">
        <h2 className="font-bold">Your data</h2>
        <p className="text-sm text-muted-foreground">
          Your timetable, tasks, attendance, notes text and chat are saved to your private MUeRA
          account (Supabase) so they follow you across devices, and only you can read them. Uploaded
          files are read in your browser. If you turn on Google Drive, the original file is also
          saved in your own Drive. When you use an AI feature, only the text you chose to send goes
          to our AI provider (Groq) to get an answer; Groq is set to zero data retention. Clearing
          browser data does not delete your account data.
        </p>
        <p className="text-sm">
          {s.tasks.length} items · {s.subjects.length} subjects · {s.docs.length} documents ·{" "}
          {s.aiCalls} AI requests made
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              actions.clearDemo();
              toast.success("Demo data removed");
            }}
          >
            Remove demo data
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              actions.loadDemo();
              toast.success("Demo data loaded");
            }}
          >
            Load demo data
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (
                confirm(
                  "Delete ALL your MUeRA data (this device and your MUeRA account)? Files you saved in your Google Drive are not deleted.",
                )
              ) {
                actions.wipeAll();
                toast.success("All data deleted");
              }
            }}
          >
            Delete all my data
          </Button>
        </div>
      </section>
    </div>
  );
}

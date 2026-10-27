import { toast } from "sonner";
import {
  connectDrive,
  driveConfigured,
  driveEnabled,
  driveTokenValid,
  uploadToDrive,
} from "./drive";

/**
 * Save an uploaded file to the user's Drive. The access token lives only in memory, so after a
 * reload or expiry the user must click "Reconnect" (a real click is needed to open Google's popup).
 * Failures are always shown. onSaved gets the Drive file id once the upload succeeds.
 */
export type DriveStatus = "off" | "uploading" | "saved" | "needs-reconnect" | "failed";

async function uploadAndReport(
  file: File,
  onSaved: (id: string) => void,
  onStatus: (s: DriveStatus) => void,
): Promise<void> {
  onStatus("uploading");
  const id = await uploadToDrive(file);
  onSaved(id);
  onStatus("saved");
  toast.success("Saved a copy to your Google Drive.");
}

/** Must run inside a real click: opens Google's popup, then uploads. Used by the toast and the inline button. */
export async function reconnectAndSave(
  file: File,
  onSaved: (id: string) => void,
  onStatus: (s: DriveStatus) => void = () => undefined,
): Promise<void> {
  try {
    await connectDrive();
    await uploadAndReport(file, onSaved, onStatus);
  } catch (e) {
    onStatus("failed");
    toast.error(e instanceof Error ? e.message : "Couldn't save the file to your Google Drive.");
  }
}

export async function saveFileToDrive(
  file: File,
  onSaved: (id: string) => void,
  onStatus: (s: DriveStatus) => void = () => undefined,
): Promise<void> {
  if (!driveConfigured() || !driveEnabled()) return onStatus("off");
  if (driveTokenValid()) {
    try {
      await uploadAndReport(file, onSaved, onStatus);
    } catch {
      onStatus("failed");
      toast.error("Couldn't save the file to your Google Drive. The text was still read.");
    }
    return;
  }
  onStatus("needs-reconnect");
  toast.warning("Google Drive needs to be reconnected to save this file.", {
    duration: 30000,
    action: {
      label: "Reconnect Drive",
      onClick: () => void reconnectAndSave(file, onSaved, onStatus),
    },
  });
}

// Per-user Google Drive storage for uploaded files.
// Uses Google Identity Services (token model) with the narrow drive.file scope:
// the app can only see files it created. The short-lived access token stays in
// memory; nothing is sent to our server or stored in Supabase except the Drive file id.
// Off unless VITE_GOOGLE_CLIENT_ID is set and the user turns it on in Settings.

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "MUeRA uploads";
const PREF_KEY = "muera:drive-enabled";

export const driveConfigured = (): boolean => !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const driveEnabled = (): boolean =>
  typeof localStorage !== "undefined" && localStorage.getItem(PREF_KEY) === "1";
export const setDriveEnabled = (on: boolean) => {
  if (on) localStorage.setItem(PREF_KEY, "1");
  else localStorage.removeItem(PREF_KEY);
};

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (c: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: unknown) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let token: { value: string; expires: number } | null = null;
let folderId: string | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load Google sign-in."));
    document.head.appendChild(s);
  });
}

/** Must be called from a click handler (browsers block popups otherwise). */
export async function connectDrive(): Promise<void> {
  if (!driveConfigured()) throw new Error("Google Drive is not set up for this app yet.");
  if (token && token.expires > Date.now() + 30_000) return;
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error("Drive access was not allowed."));
        token = { value: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve();
      },
      error_callback: () => reject(new Error("Drive access was not allowed.")),
    });
    client.requestAccessToken();
  });
}

export function disconnectDrive() {
  token = null;
  folderId = null;
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  if (!token || token.expires < Date.now()) throw new Error("Drive is not connected.");
  const r = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token.value}` },
  });
  if (r.status === 401) token = null;
  if (!r.ok) throw new Error(`Drive request failed (${r.status}).`);
  return r;
}

async function ensureFolder(): Promise<string> {
  if (folderId) return folderId;
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const found = await (
    await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`)
  ).json();
  if (found.files?.[0]?.id) return (folderId = found.files[0].id as string);
  const made = await (
    await api("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    })
  ).json();
  return (folderId = made.id as string);
}

/** Upload one file to the user's own Drive. Returns the Drive file id. */
export async function uploadToDrive(file: File): Promise<string> {
  const parent = await ensureFolder();
  const meta = { name: file.name, parents: [parent] };
  const boundary = "muera" + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);
  const r = await api(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  return (await r.json()).id as string;
}

/** Move a file we created to Drive trash (recoverable by the user). Only call after the user chose it. */
export async function trashDriveFile(id: string): Promise<void> {
  await api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

export const driveTokenValid = (): boolean => !!token && token.expires > Date.now() + 30_000;

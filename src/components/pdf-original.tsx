import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type Doc, getActiveUserId, setState } from '@/lib/store';
import { originalFile } from '@/lib/pdf-original';
import { reconnectAndSave } from '@/lib/drive-ui';
import { driveConfigured } from '@/lib/drive';

export function PdfOriginal({ doc }: { doc: Doc }) {
  const [file, setFile] = useState<File>();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<File>();
  const user = getActiveUserId();
  useEffect(() => {
    let active = true;
    setFile(undefined);
    if (user) void originalFile(user, doc.id).then(f => { if (active) setFile(f); }).catch(() => {});
    return () => { active = false; };
  }, [user, doc.id]);
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const u = URL.createObjectURL(file); setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const saved = (id: string) => {
    if (getActiveUserId() !== user) return;
    setState(s => ({ docs: s.docs.map(d => d.id === doc.id ? { ...d, driveFileId: id } : d) }));
  };
  const attach = async (f: File) => {
    if (!user || getActiveUserId() !== user) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return toast.error('Choose the original PDF.');
    if ((await f.slice(0, 5).text()) !== '%PDF-') return toast.error('This file is not a PDF.');

    try { await originalFile(user, doc.id, f); setFile(f); toast.success('Original attached on this browser. Save to Drive to open it on other devices.'); }
    catch { toast.error('Could not keep this PDF. Browser storage may be full or unavailable.'); }
  };
  if (doc.driveFileId) return <a className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent" href={`https://drive.google.com/file/d/${doc.driveFileId}/view`} target="_blank" rel="noreferrer" aria-label="Open original PDF in your Google Drive">Open PDF</a>;
  return <div className="flex w-full flex-wrap items-center gap-2 text-xs">
    {url ? <>
      <a className="rounded-md border px-2 py-1 font-medium hover:bg-accent" href={url} target="_blank" rel="noreferrer">Open PDF</a>
      <span className="text-muted-foreground">Saved on this browser only</span>
      {driveConfigured() && <button disabled={busy} className="rounded-md border px-2 py-1" onClick={() => {
        if (!file || busy) return; setBusy(true);
        void reconnectAndSave(file, saved).finally(() => setBusy(false));
      }}>{busy ? 'Saving to Drive...' : 'Save original to my Drive'}</button>}
    </> : <>
      <span className="text-muted-foreground">Original not saved on this browser or linked to Drive.</span>
      <label className="cursor-pointer rounded-md border px-2 py-1 font-medium hover:bg-accent">Attach original PDF<input aria-label={`Attach original PDF for ${doc.name}`} className="hidden" type="file" accept="application/pdf" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCandidate(f); }} /></label>
    </>}
    {candidate && <div className="w-full rounded-md border p-2">Attach "{candidate.name}" as the matching original for "{doc.name}"? Saved text, notes and stack will not change.<div className="mt-1 flex gap-2"><button className="rounded-md border px-2 py-1" onClick={() => { void attach(candidate); setCandidate(undefined); }}>Confirm matching original</button><button className="rounded-md border px-2 py-1" onClick={() => setCandidate(undefined)}>Cancel</button></div></div>}
  </div>;
}

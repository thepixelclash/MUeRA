// Original bytes stay private to this browser and signed-in account. Never sync blobs to Supabase.
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('muera-original-pdfs', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function originalFile(user: string, id: string, file?: File): Promise<File | undefined> {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = d.transaction('files', file ? 'readwrite' : 'readonly');
      const store = tx.objectStore('files');
      const request = file ? store.put(file, `${user}:${id}`) : store.get(`${user}:${id}`);
      let result: File | undefined;
      request.onsuccess = () => { result = file ?? request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { d.close(); }
}

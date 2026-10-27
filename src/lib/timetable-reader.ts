/** Browser-only, called on upload. PDF coordinates preserve table rows/columns. */
type Positioned = { text: string; x: number; y: number; width: number };

function rows(items: Positioned[]): string {
  const grouped: Positioned[][] = [];
  items
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((item) => {
      const row = grouped.find((r) => Math.abs(r[0].y - item.y) < 7);
      if (row) row.push(item);
      else grouped.push([item]);
    });
  return grouped
    .map((r) => {
      r.sort((a, b) => a.x - b.x);
      return r
        .map(
          (item, i) =>
            (i && item.x - (r[i - 1].x + r[i - 1].width) > 16 ? " | " : i ? " " : "") + item.text,
        )
        .join("");
    })
    .join("\n");
}

/** y grows downward for every source (pdfjs y is negated, OCR bbox is top-down). */
const DAY_WORD = /^(sun|mon|tues?|wed|thurs?|fri|sat)/i;
const SLOT_TIME =
  /^(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})(?:\s*([ap])\.?\s?m\.?)?$/i;
const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABEL: Record<string, string> = {
  sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday",
  thu: "Thursday", fri: "Friday", sat: "Saturday",
};

function fmtTime(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Detect a weekly slot grid (a header row of time ranges plus day-labelled rows)
 * and emit one authoritative line per cell: "Monday | 09:30-10:15 | cell text".
 * Merged multi-slot cells get their full start-end span; batch-split cells keep
 * both descriptions in one line for the AI to split. Returns null when the page
 * is not a slot grid so callers fall back to plain rows.
 */
function slotGrid(items: Positioned[]): string | null {
  // Header: a row with at least three "9.30-10.15" style ranges.
  const byY = new Map<number, Positioned[]>();
  for (const item of items) {
    if (!SLOT_TIME.test(item.text)) continue;
    const key = [...byY.keys()].find((k) => Math.abs(k - item.y) < 7);
    if (key === undefined) byY.set(item.y, [item]);
    else byY.get(key)!.push(item);
  }
  const header = [...byY.values()].filter((g) => g.length >= 3).sort((a, b) => b.length - a.length)[0];
  if (!header) return null;
  header.sort((a, b) => a.x - b.x);

  let prev = -1;
  const cols = header.map((h) => {
    const m = h.text.match(SLOT_TIME)!;
    let s = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    let e = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
    if (/p/i.test(m[5] ?? "")) {
      if (parseInt(m[1], 10) < 12) s += 720;
      if (parseInt(m[3], 10) < 12) e += 720;
    }
    if (prev >= 0 && s < prev - 60) s += 720;
    if (e <= s) e += 720;
    prev = s;
    return { s, e, cx: h.x + h.width / 2 };
  });
  const left = cols[0].cx - (cols[1].cx - cols[0].cx) / 2;

  // Day anchors: day words left of the first column.
  const anchors = items
    .filter((i) => DAY_WORD.test(i.text) && i.x + i.width / 2 < left)
    .map((i) => ({ day: i.text.toLowerCase().slice(0, 3), y: i.y }))
    .sort((a, b) => a.y - b.y);
  if (anchors.length < 2) return null;
  const gaps = anchors.slice(1).map((a, i) => a.y - anchors[i].y).filter((g) => g > 0).sort((a, b) => a - b);
  const medGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 40;
  const headerY = header[0].y;
  const bands = anchors.map((a, i) => ({
    day: DAY_ORDER.includes(a.day) ? a.day : a.day.slice(0, 3),
    top: i === 0 ? a.y - medGap / 2 : (anchors[i - 1].y + a.y) / 2,
    bottom: i === anchors.length - 1 ? a.y + medGap / 2 : (a.y + anchors[i + 1].y) / 2,
  }));

  type Cell = { day: string; c0: number; c1: number; items: Positioned[] };
  const cells = new Map<string, Cell>();
  void 0;
  for (const item of items) {
    if (SLOT_TIME.test(item.text)) continue;
    if (Math.abs(item.y - headerY) < 7) continue;
    const band = bands.find((b) => item.y >= b.top && item.y < b.bottom);
    if (!band) continue;
    if (DAY_WORD.test(item.text) && item.x + item.width / 2 < left) continue;
    const x0 = item.x - 2;
    const x1 = item.x + item.width + 2;
    let span = cols.map((c, i) => (c.cx >= x0 && c.cx <= x1 ? i : -1)).filter((i) => i >= 0);
    if (!span.length) {
      let best = 0;
      cols.forEach((c, i) => {
        if (Math.abs(c.cx - (item.x + item.width / 2)) < Math.abs(cols[best].cx - (item.x + item.width / 2))) best = i;
      });
      span = [best];
    }
    const key = `${band.day}:${span[0]}-${span[span.length - 1]}`;
    const cell = cells.get(key);
    if (cell) cell.items.push(item);
    else cells.set(key, { day: band.day, c0: span[0], c1: span[span.length - 1], items: [item] });
  }

  // Merge continuation lines of merged cells: a narrow cell whose column span
  // sits inside a wider same-day cell at the same height belongs to it.
  const list = [...cells.values()];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const ay = a.items.reduce((s, it) => s + it.y, 0) / a.items.length;
    const host = list.find(
      (b) =>
        b !== a && b.day === a.day &&
        b.c0 <= a.c0 && b.c1 >= a.c1 && (b.c1 - b.c0) > (a.c1 - a.c0) &&
        Math.abs(b.items.reduce((s, it) => s + it.y, 0) / b.items.length - ay) < medGap / 2,
    );
    if (host) {
      host.items.push(...a.items);
      list.splice(i, 1);
      i--;
    }
  }
  const lines = list
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.c0 - b.c0)
    .map((cell) => {
      const text = cell.items
        .sort((a, b) => Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x)
        .map((i) => i.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return `${DAY_LABEL[cell.day] ?? cell.day} | ${fmtTime(cols[cell.c0].s)}-${fmtTime(cols[cell.c1].e)} | ${text}`;
    })
    .filter((l) => l.length > 0);
  if (lines.length < 3) return null;
  return [
    "SLOT GRID (authoritative day and time for each cell; one cell may hold two parallel batch sessions - output each as its own class and keep its batch tag such as F1/F2 in the name):",
    ...lines,
  ].join("\n");
}

export async function readTimetable(
  file: File,
  progress: (message: string) => void,
): Promise<string> {
  let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | undefined;
  const ocr = async (source: File | HTMLCanvasElement) => {
    if (!worker) {
      progress("Loading free text recognition…");
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", 1, {
        logger: (m) => progress(`Reading image… ${Math.round(m.progress * 100)}%`),
      });
    }
    const result = await worker.recognize(source, {}, { blocks: true });
    const items: Positioned[] = [];
    for (const block of result.data.blocks ?? [])
      for (const paragraph of block.paragraphs)
        for (const line of paragraph.lines)
          for (const word of line.words) {
            items.push({
              text: word.text,
              x: word.bbox.x0,
              y: word.bbox.y0,
              width: word.bbox.x1 - word.bbox.x0,
            });
          }
    if (!items.length) return result.data.text;
    const grid = slotGrid(items);
    return grid ? `${grid}\nRAW TABLE TEXT:\n${rows(items)}` : rows(items);
  };
  try {
    if (file.type.startsWith("image/")) return await ocr(file);
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name))
      throw new Error("Upload a PDF or image.");
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const doc = await loadingTask.promise;
    const pages: string[] = [];
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        progress(`Reading PDF page ${n} of ${doc.numPages}…`);
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        const items = content.items.flatMap((it) =>
          "str" in it && it.str.trim()
            ? [{ text: it.str, x: it.transform[4], y: -it.transform[5], width: it.width }]
            : [],
        );
        if (items.length) {
          const grid = slotGrid(items);
          pages.push(grid ? `${grid}\nRAW TABLE TEXT:\n${rows(items)}` : rows(items));
        } else {
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not read scanned PDF page.");
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          pages.push(await ocr(canvas));
        }
      }
    } finally {
      await loadingTask.destroy();
    }
    return pages.join("\n");
  } finally {
    await worker?.terminate();
  }
}

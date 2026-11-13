// Browser helper: calls the translate API repeatedly until nothing is left,
// so large courses don't hit a single request's time limit.
export async function runTranslation(
  courseId: string,
  opts: { keys?: string[]; force?: boolean } = {},
  onProgress?: (translatedSoFar: number, remaining: number) => void
): Promise<{ ok: true; translated: number } | { ok: false; error: string }> {
  let total = 0;
  // Safety cap so a bug can never loop forever.
  for (let i = 0; i < 200; i++) {
    const res = await fetch("/api/admin/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, ...opts }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Translation failed." };
    total += data.translated ?? 0;
    onProgress?.(total, data.remaining ?? 0);
    if (!data.remaining || data.translated === 0) break;
  }
  return { ok: true, translated: total };
}

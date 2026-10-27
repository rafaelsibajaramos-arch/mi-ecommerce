// Read only the primary quote. Ignore charts, related currencies and scripts.
export function parseGoogleRate(html: string): number {
  if (!/<title>USD\/COP Currency Exchange Rate/.test(html)) {
    throw new Error("Google no devolvió la cotización USD/COP");
  }
  const quote = html.match(/<div\b[^>]*class="N6SYTe"[^>]*>([\s\S]*?)<\/div>/)?.[1]
    ?? html.match(/<div\b[^>]*class="[^"]*\bYMlKec\b[^"]*\bfxKbKc\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  const text = quote?.replace(/<[^>]*>/g, "").trim();
  if (!text || !/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(text)) {
    throw new Error("No se encontró el precio principal de Google Finance");
  }
  const rate = Number(text.replaceAll(",", ""));
  if (!Number.isFinite(rate) || rate < 100 || rate > 100000) {
    throw new Error("Google devolvió una tasa fuera de rango");
  }
  return Math.round(rate * 100) / 100;
}

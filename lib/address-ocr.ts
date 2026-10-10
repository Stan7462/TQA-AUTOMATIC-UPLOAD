/** Keep OCR-derived addresses conservative: ambiguous screenshots remain undetected. */
export function normalizeAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned && cleaned.length <= 300 ? cleaned : null;
}

export function screenshotAddress(text: string, confidence = 100): string | null {
  if (confidence < 60) return null;
  const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const street = /^\d{1,6}[A-Za-z]?\s+(?:[A-Za-z0-9.'’-]+\s+){1,8}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|boulevard|blvd|way|place|pl|terrace|ter|trail|trl|parkway|pkwy|highway|hwy)\b/i;
  const cityStateZip = /^[A-Za-z .'-]+,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i;
  const candidates = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i].match(/^(?:(?:service|installation|customer|job|premise)\s+)?address\s*[:#-]?\s*(.*)$/i);
    let value = label ? label[1] || lines[i + 1] || "" : lines[i];
    let last = label && !label[1] ? i + 1 : i;
    if (!street.test(value)) continue;
    // Stop at unrelated fields instead of incorporating account/phone numbers.
    value = value.split(/\s+(?:phone|account|job\s*#|customer\s*(?:name|id))\s*[:#]/i)[0].trim();
    if (/^(?:apt|unit|suite|ste)\s*#?\s*[A-Za-z0-9-]+$/i.test(lines[last + 1] || "")) value += " " + lines[++last];
    if (cityStateZip.test(lines[last + 1] || "")) value = value.replace(/[,;]+$/, "") + ", " + lines[last + 1];
    const address = normalizeAddress(value);
    if (address) candidates.add(address);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

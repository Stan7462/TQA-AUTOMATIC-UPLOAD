// Only accept a number explicitly labelled as a job/work order. Account numbers,
// phone numbers and postal codes elsewhere in the screenshot are not candidates.
export function sixDigitJobNumber(text: string, confidence = 100): string | null {
  if (confidence < 60) return null;
  const candidates = new Set<string>();
  // Thin header icons and anti-aliased text can make Tesseract insert one stray
  // stroke-like character after the label (for example, "Job#t 768817").
  const labelledNumber = /\b(?:job|work\s*order)\s*(?:(?:number|no\.?|id)\s*)?[#:\-]?\s*[|IlTt]?\s*(\d{6})(?![\w]|[ .-]\d)/gi;
  for (const match of text.matchAll(labelledNumber)) candidates.add(match[1]);
  return candidates.size === 1 ? [...candidates][0] : null;
}

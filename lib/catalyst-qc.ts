export type CatalystFailure = { code: string; reason: string };

export const catalystQcCategories = [
  { code: "TQA1", title: "Comcast Requirements (Bonding)", reasons: [
    "Proper Bonding Hierarchy followed",
    "25 Ohm resistance test performed",
    "Second Do Not remove tag with bonding validation date",
  ] },
  { code: "TQA2", title: "NEC Electrical Requirements (Bonding)", reasons: [
    "Bond Block Installed",
    "Bond Wire Installed, correct gauge",
    "Approved Bonding Hardware used - not shared",
    "Attached to Approved Premise Power Grounding System Point",
    "Bond Wire routed and attached properly; with correct bending radius",
    "Do not remove tag in place",
  ] },
  { code: "TQA3", title: "Aerial to Underground Transition Meets OES (Pole/Sub Pole)", reasons: [
    "Proper attachment hardware used and clearances maintained at pole",
    "Proper drip / slack loops as required",
    "Proper pole to pole or mid span slack maintained",
    "If required, proper transition from aerial to underground cable",
    "Drop protected by pole guard at pole",
  ] },
  { code: "TQA4", title: "Tap Location Meets OES (Tap)", reasons: [
    "Ped or lock box locked / secured",
    "Ped or lock box damage reported",
    "Proper tags in place",
    "Unused ports terminated / NAP ports closed",
    "Traps / filters not directly connected to tap port",
    "Approved connector properly installed",
    "Weather sealing as required",
    "Connectors tightened properly",
  ] },
  { code: "TQA5", title: "Drop attachment Meets OES (Premise)", reasons: [
    "Proper drop attachment to premise with approved hardware & drip / slack loop",
    "Proper use and installation of drop guard as required",
    "Cable properly routed, clearances and bending radius maintained",
    "Properly attached to premise, clip distance and clip type based on premise material",
    "Splicing guidelines followed",
  ] },
  { code: "TQA6", title: "Service Distribution Point Meets OES (Premise)", reasons: [
    "POE/POE Bond Block Installed",
    "Approved Connector Properly Installed",
    "Weather sealing as required",
    "Connectors tightened properly",
    "Unused ports terminated",
    "Enclosure installed as required, located properly and clearances maintained",
    "Correct service Distribution configuration utilized, i.e. passive, MoCA splitter, unity gain.",
    "All hardware, i.e. splitters bond block, amplifiers etc., properly attached",
    "Correct excess cable and stored properly",
    "Cable properly routed, clearances, and bending radius maintained",
    "Properly attached to premise, clip distance, and clip type based on premise material",
    "Proper drip loops at entry holes, sealing guidelines followed",
    "Splicing guidelines followed",
  ] },
  { code: "TQA7", title: "Inside Wiring CPE", reasons: [
    "Approved Connector Properly Installed",
    "Cable properly routed, clearances, and bending radius maintained",
    "Properly attached clip distance, and clip type used base on material attaching to",
    "Cable correctly terminated at CPE location, wall plate installed.",
    "CPE correctly located within the premise",
    "Proper Installation and mounting guidelines followed",
    "If present, proper location and mounting of ONU, including bonding if required.",
    "Proper use of plenum or riser cable as required, including firewall penetration sealant.",
  ] },
] as const;

const aliases: Record<string, string> = {
  ground: "ground grounding bond bonding electrical meter power", grounding: "ground bonding electrical meter",
  wire: "wire cable bonding", tap: "tap port ports nap", connector: "connector connectors crimp crimped",
  tag: "tag tags label", box: "box enclosure ped pedestal lock", drip: "drip loop slack",
  photo: "picture image visible", pole: "pole aerial underground", cpe: "cpe equipment device",
};

function words(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((word) => word.length > 2);
}

export function isCatalystFailure(value: unknown): value is CatalystFailure {
  if (!value || typeof value !== "object") return false;
  const candidate = value as CatalystFailure;
  const category = catalystQcCategories.find((item) => item.code === candidate.code);
  return Boolean(category && typeof candidate.reason === "string" && (category.reasons as readonly string[]).includes(candidate.reason));
}

export function normalizeCatalystFailures(value: unknown): CatalystFailure[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20 || !value.every(isCatalystFailure)) return null;
  const unique = new Map(value.map((item) => [`${item.code}\0${item.reason}`, item]));
  const failures = [...unique.values()];
  return new Set(failures.map((item) => item.code)).size === failures.length ? failures : null;
}

export function suggestCatalystFailures(comment: string, limit = 6): CatalystFailure[] {
  const input = new Set(words(comment).flatMap((word) => [word, ...words(aliases[word] ?? "")]));
  if (!input.size) return [];
  return catalystQcCategories.flatMap((category) => category.reasons.map((reason) => {
    const haystack = new Set(words(`${category.title} ${reason}`));
    let score = 0;
    for (const word of input) if (haystack.has(word) || [...haystack].some((candidate) => candidate.startsWith(word) || word.startsWith(candidate))) score += word.length > 5 ? 3 : 1;
    return { code: category.code, reason, score };
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(({ code, reason }) => ({ code, reason }));
}

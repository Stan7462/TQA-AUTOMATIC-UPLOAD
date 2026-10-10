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

// Display labels only. Stored selections and Catalyst uploads retain the original reason.
const failureLabels: Record<string, Record<string, string>> = {
  TQA1: {
    "Proper Bonding Hierarchy followed": "The grounding connection does not follow the required order of preferred connection points.",
    "25 Ohm resistance test performed": "The required ground resistance test was not done or verified.",
    "Second Do Not remove tag with bonding validation date": "The extra grounding verification tag or its date is missing.",
  },
  TQA2: {
    "Bond Block Installed": "The grounding block is missing or installed incorrectly.",
    "Bond Wire Installed, correct gauge": "The grounding wire is missing or is the wrong thickness.",
    "Approved Bonding Hardware used - not shared": "The grounding clamp is unsuitable or improperly shares another connection.",
    "Attached to Approved Premise Power Grounding System Point": "The grounding wire connects to the wrong grounding point.",
    "Bond Wire routed and attached properly; with correct bending radius": "The grounding wire is loose, routed badly, or bent too sharply.",
    "Do not remove tag in place": "The grounding warning tag is missing.",
  },
  TQA3: {
    "Proper attachment hardware used and clearances maintained at pole": "The pole attachment is wrong, or the cable is too close to other equipment.",
    "Proper drip / slack loops as required": "The required extra cable loops are missing or incorrect.",
    "Proper pole to pole or mid span slack maintained": "The cable between poles is too tight or hangs too loosely.",
    "If required, proper transition from aerial to underground cable": "The change from overhead cable to underground cable is installed incorrectly.",
    "Drop protected by pole guard at pole": "The protective covering for cable running down the pole is missing or incorrect.",
  },
  TQA4: {
    "Ped or lock box locked / secured": "The outdoor pedestal or connection box is left open or unsecured.",
    "Ped or lock box damage reported": "Damage to the pedestal or connection box was not reported.",
    "Proper tags in place": "Required cable identification tags are missing or incorrect.",
    "Unused ports terminated / NAP ports closed": "Unused connections are left without their required terminators or closures.",
    "Traps / filters not directly connected to tap port": "A trap or filter is attached directly to the tap where that arrangement is not allowed.",
    "Approved connector properly installed": "The cable connector at the tap is the wrong type or fitted incorrectly.",
    "Weather sealing as required": "The tap connection lacks the required protection against water.",
    "Connectors tightened properly": "A connector at the tap is loose or tightened incorrectly.",
  },
  TQA5: {
    "Proper drop attachment to premise with approved hardware & drip / slack loop": "The incoming cable is not properly anchored, or its required loop is missing.",
    "Proper use and installation of drop guard as required": "Required cable protection on the building is missing or installed incorrectly.",
    "Cable properly routed, clearances and bending radius maintained": "The outdoor cable follows a poor route, is too close to something, or bends too sharply.",
    "Properly attached to premise, clip distance and clip type based on premise material": "The outdoor cable clips are unsuitable for the surface or spaced incorrectly.",
    "Splicing guidelines followed": "An outdoor cable joint was made incorrectly or where it should not be.",
  },
  TQA6: {
    "POE/POE Bond Block Installed": "The required point-of-entry filter or grounding block arrangement is missing or incorrect.",
    "Approved Connector Properly Installed": "A connector at the building distribution point is unsuitable or fitted incorrectly.",
    "Weather sealing as required": "Outdoor distribution connections are not properly protected from water.",
    "Connectors tightened properly": "Connections at the building distribution point are loose or tightened incorrectly.",
    "Unused ports terminated": "Unused splitter or equipment ports lack the required terminators.",
    "Enclosure installed as required, located properly and clearances maintained": "The protective box is missing, positioned badly, or lacks required space around it.",
    "Correct service Distribution configuration utilized, i.e. passive, MoCA splitter, unity gain.": "The wrong splitter, amplifier, or equipment arrangement was used.",
    "All hardware, i.e. splitters bond block, amplifiers etc., properly attached": "Splitters, grounding blocks, or amplifiers are loose or hanging.",
    "Correct excess cable and stored properly": "Too much or too little spare cable was left, or it is stored badly.",
    "Cable properly routed, clearances, and bending radius maintained": "Cable around the distribution equipment is routed badly or bent too sharply.",
    "Properly attached to premise, clip distance, and clip type based on premise material": "Cable supports at the distribution point are unsuitable or spaced incorrectly.",
    "Proper drip loops at entry holes, sealing guidelines followed": "Cable entry holes are not sealed correctly, or the loop that keeps water away is missing.",
    "Splicing guidelines followed": "A cable joint at the distribution point does not follow the required installation rules.",
  },
  TQA7: {
    "Approved Connector Properly Installed": "An indoor cable connector is unsuitable or fitted incorrectly.",
    "Cable properly routed, clearances, and bending radius maintained": "Indoor cable is routed badly, too close to something, or bent too sharply.",
    "Properly attached clip distance, and clip type used base on material attaching to": "Indoor cable clips are unsuitable or spaced incorrectly.",
    "Cable correctly terminated at CPE location, wall plate installed.": "The cable connection at the equipment is unfinished or incorrect, or a required wall plate is missing.",
    "CPE correctly located within the premise": "The customer equipment is placed in an unsuitable location.",
    "Proper Installation and mounting guidelines followed": "The customer equipment is not installed or secured correctly.",
    "If present, proper location and mounting of ONU, including bonding if required.": "The optical network unit is positioned, mounted, or grounded incorrectly.",
    "Proper use of plenum or riser cable as required, including firewall penetration sealant.": "The wrong cable type was used in an area requiring special cable, or a fire-rated opening was not properly sealed.",
  },
};

export function catalystFailureLabel(failure: CatalystFailure): string {
  return failureLabels[failure.code]?.[failure.reason] ?? failure.reason;
}

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
  const input = new Set(words(comment));
  if (!input.size) return [];
  return catalystQcCategories.flatMap((category) => category.reasons.map((reason) => {
    const haystack = new Set(words(catalystFailureLabel({ code: category.code, reason })));
    let score = 0;
    for (const word of input) if (haystack.has(word) || [...haystack].some((candidate) => candidate.startsWith(word) || word.startsWith(candidate))) score += word.length > 5 ? 3 : 1;
    return { code: category.code, reason, score };
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(({ code, reason }) => ({ code, reason }));
}

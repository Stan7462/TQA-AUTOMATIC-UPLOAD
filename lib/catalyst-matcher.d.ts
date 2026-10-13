import type { CatalystFailure } from "./catalyst-qc";
export type MatcherReason = CatalystFailure & { id: string; label: string; hits: string[]; problemHits: string[] };
export type ReviewedExample = { comment: string; location: string; ids: string[] };
export type MatcherGroup = { id: string; object: string; comment: string; results: MatcherReason[]; ambiguous: boolean };
export function matchCatalystFailures(comment: string, options?: { location?: string; contexts?: Record<string,string>; reviewed?: ReviewedExample[] }): { results: MatcherReason[]; groups: MatcherGroup[]; changes: string[]; reviewed?: boolean };
export function normalizeMatcherComment(comment: string): string;
export const matcherScopeNames: Record<string,string>;
export function matcherScope(code: string): string;

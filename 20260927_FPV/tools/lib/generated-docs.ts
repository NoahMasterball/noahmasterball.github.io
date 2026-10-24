import { balanceMarkdown, rosterMarkdown } from '../../src/balance/report.ts';
import { BINDINGS, SYSTEM_KEYS } from '../../src/config/client.ts';

// NEW — the complete set of generated documentation (ADR-0010). Pure: returns file contents;
// tools/gen-docs.ts writes them, tests/unit/generated-docs.test.ts checks they are current.

export const CONTROLS_START = '<!-- GENERATED:controls -->';
export const CONTROLS_END = '<!-- /GENERATED:controls -->';

export function controlsMarkdown(): string {
  const rows = [...BINDINGS, ...SYSTEM_KEYS].map((b) => `| ${b.label} | ${b.description} |`);
  return ['| Input | Action |', '| --- | --- |', ...rows].join('\n');
}

/** Replaces the block between the controls markers in a README. */
export function withControls(readme: string): string {
  const start = readme.indexOf(CONTROLS_START);
  const end = readme.indexOf(CONTROLS_END);
  if (start < 0 || end < start) throw new Error('README is missing the GENERATED:controls markers');
  return `${readme.slice(0, start + CONTROLS_START.length)}\n${controlsMarkdown()}\n${readme.slice(end)}`;
}

/** Relative path (from the project root) → full generated file content. */
export function generatedFiles(): Record<string, string> {
  return {
    'docs/generated/BALANCE.md': balanceMarkdown(),
    'docs/generated/ROSTER.md': rosterMarkdown(),
  };
}

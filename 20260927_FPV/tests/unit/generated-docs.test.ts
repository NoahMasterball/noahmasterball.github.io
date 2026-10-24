import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generatedFiles, withControls } from '../../tools/lib/generated-docs.ts';

// ADR-0010: generated docs must match src/data and src/config. Fix with `npm run docs:gen`.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');

describe('generated docs are up to date (run `npm run docs:gen` if this fails)', () => {
  for (const [relative, content] of Object.entries(generatedFiles())) {
    it(relative, () => {
      expect(read(relative)).toBe(content);
    });
  }

  it('README.md controls block', () => {
    const readme = read('README.md');
    expect(withControls(readme)).toBe(readme);
  });
});

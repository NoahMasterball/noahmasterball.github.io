// npm run docs:gen — writes the generated docs (ADR-0010): docs/generated/*.md and the
// controls block in README.md. Run after changing src/data/ or key bindings.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedFiles, withControls } from './lib/generated-docs.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const [relative, content] of Object.entries(generatedFiles())) {
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log(`wrote ${relative}`);
}

const readmePath = join(root, 'README.md');
writeFileSync(readmePath, withControls(readFileSync(readmePath, 'utf8')));
console.log('updated README.md controls block');

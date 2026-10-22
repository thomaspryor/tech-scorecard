import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyProblem, listTsFiles, productCopyViolations, sourceCopyViolations } from '../scripts/lib/copy-voice';
import products from '../data/products.json';

const root = path.join(__dirname, '..');

describe('copyProblem', () => {
  it.each([
    ['Bad — copy', 'em dash'],
    ['Entity &mdash; bad', 'em dash'],
    ['Name – Title', 'spaced en dash'],
    ['We truly care', '"truly"'],
    ['It serves as a guide', '"serves as"'],
    ['Not just a phone, but a camera', '"Not just a phone, but"'],
  ])('flags %s', (text, problem) => {
    expect(copyProblem(text)).toBe(problem);
  });

  it('passes plain copy and number ranges', () => {
    expect(copyProblem('Battery lasts two days, and the screen is bright.')).toBeNull();
    expect(copyProblem('Scores 71–90')).toBeNull();
  });
});

describe('sourceCopyViolations', () => {
  it('checks rendered strings, not comments or console output', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
    const file = path.join(dir, 'x.tsx');
    fs.writeFileSync(
      file,
      [
        '// comment — fine',
        'const a = <p>Bad — copy</p>;',
        "const b = 'We truly care';",
        "console.warn('log — truly fine');",
        'const c = `${a} – ${b}`;',
        "const d = 'Clean sentence.';",
      ].join('\n'),
    );
    expect(sourceCopyViolations(file, dir).map((h) => h.split(':')[1])).toEqual(['2', '3']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('site copy follows the voice rules', () => {
  it('in src/', () => {
    const hits = ['src/app', 'src/components', 'src/config', 'src/lib']
      .flatMap((d) => listTsFiles(path.join(root, d)))
      .flatMap((f) => sourceCopyViolations(f, root));
    expect(hits, 'rewrite with commas, periods or parentheses, and plain wording').toEqual([]);
  });

  it('in products.json (criticsTake, loved, gripes; review excerpts are quotes and exempt)', () => {
    expect(productCopyViolations(products as never)).toEqual([]);
  });
});

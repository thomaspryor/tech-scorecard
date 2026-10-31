import { describe, expect, it } from 'vitest';
import { consensusSentences } from '@/lib/consensus';
import { computeProduct } from '@/lib/engine';
import { copyProblem } from '../scripts/lib/copy-voice';
import { outlet, product, review } from './fixtures';

const outlets = {
  'the-verge': outlet(),
  cnet: outlet({ id: 'cnet', name: 'CNET', tier: 1 }),
  techradar: outlet({ id: 'techradar', name: 'TechRadar', tier: 2 }),
  pcmag: outlet({ id: 'pcmag', name: 'PCMag', tier: 2 }),
  wired: outlet({ id: 'wired', name: 'Wired', tier: 1 }),
};

function build(scores: [keyof typeof outlets, number, Record<string, unknown>?][]) {
  const reviews = scores.map(([outletId, score, over]) => review({ outletId, score, ...over }));
  return computeProduct(product(), reviews, outlets);
}

describe('consensusSentences', () => {
  it('is empty without a score', () => {
    expect(consensusSentences(build([['the-verge', 90]]))).toEqual([]);
  });

  it('says critics agree when scores sit close together', () => {
    const p = build([
      ['the-verge', 88],
      ['cnet', 86],
      ['techradar', 85],
      ['pcmag', 84],
      ['wired', 90],
    ]);
    const text = consensusSentences(p).join(' ');
    expect(text).toContain('Critics largely agree: all 5 reviews land between 84 and 90.');
    expect(text).toContain('Every review scores 80 or higher.');
    expect(text).not.toContain('most enthusiastic');
  });

  it('names the extremes and flags a split', () => {
    const p = build([
      ['the-verge', 92],
      ['cnet', 80],
      ['techradar', 70],
      ['pcmag', 60],
      ['wired', 58],
    ]);
    const text = consensusSentences(p).join(' ');
    expect(text).toContain('Critics are split: scores run from 58 to 92 across 5 reviews.');
    expect(text).toContain('The Verge is the most enthusiastic at 92, Wired the least at 58.');
    expect(text).toContain('2 of 5 reviews score 80 or higher.');
  });

  it('compares the major outlets with the rest only when the gap is real', () => {
    const wide = build([
      ['the-verge', 70],
      ['cnet', 72],
      ['techradar', 88],
      ['pcmag', 90],
      ['wired', 71],
    ]);
    expect(consensusSentences(wide).join(' ')).toContain(
      'The 3 major national outlets average 71, against 89 for the other 2.',
    );
    const close = build([
      ['the-verge', 80],
      ['cnet', 81],
      ['techradar', 80],
      ['pcmag', 81],
      ['wired', 80],
    ]);
    expect(consensusSentences(close).join(' ')).not.toContain('major national outlets');
  });

  it("credits Editors' Choice and dates the reviews", () => {
    const p = build([
      ['the-verge', 90, { editorsChoice: true, date: '2026-10-01' }],
      ['cnet', 88, { editorsChoice: true, date: '2026-10-05' }],
      ['techradar', 86],
      ['pcmag', 85],
      ['wired', 84],
    ]);
    const text = consensusSentences(p).join(' ');
    expect(text).toContain("The Verge and CNET gave it an Editors' Choice award.");
    expect(text).toContain('Reviews were published between Sep 20, 2026 and Oct 5, 2026.');
  });

  it('follows the site copy rules', () => {
    const p = build([
      ['the-verge', 95],
      ['cnet', 50],
      ['techradar', 70],
      ['pcmag', 60],
      ['wired', 58, { editorsChoice: true }],
    ]);
    for (const s of consensusSentences(p)) expect(copyProblem(s), s).toBeNull();
  });
});

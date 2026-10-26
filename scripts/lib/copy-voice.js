// Owner voice rules for on-screen copy, ported from Broadway Scorecard
// (scripts/lib/rendered-copy-voice.js there, BRO-5812): no em dashes and none of
// the AI-flavoured stock phrases. Source files are walked as a TypeScript AST so only
// strings that can render are checked (JSX text, string and template literals); code
// comments and console messages keep their punctuation. Review excerpts are verbatim
// quotes and are never checked.
const fs = require('fs');
const path = require('path');
// Loaded on first use: the data check (validate.js) needs only copyProblem, not the TypeScript parser.
/** @type {typeof import('typescript') | undefined} */
let tsModule;
const tsLib = () => (tsModule ??= require('typescript'));

// JSX text keeps HTML entities undecoded, so &mdash; needs its own alternative.
const EM_DASH = /—|&mdash;|&#8212;|&#x2014;|\\u2014/i;
const BANNED_PHRASES = new RegExp(
  '\\b(?:truly|genuinely|delve|robust|leverages?|leveraged|unlock(?:s|ed|ing)?|tapestry|realm|deep dive' +
    '|landscape of|journey of|navigate the|moreover|furthermore|additionally|serves as|worth noting' +
    "|it(?:'s|&apos;s| is) not just|not just [^.]{1,40}, but)\\b",
  'i',
);
// A spaced en dash is an em dash in disguise. Template literals are exempt so a
// `${a} – ${b}` range stays typographic.
const SPACED_EN_DASH = /(?:^|\s)–(?:\s|$)/;

/**
 * Why a piece of copy breaks the rules, or null when it is fine.
 * @param {string} text
 * @param {{allowSpacedEnDash?: boolean}} [opts]
 * @returns {string | null}
 */
function copyProblem(text, { allowSpacedEnDash = false } = {}) {
  if (EM_DASH.test(text)) return 'em dash';
  if (!allowSpacedEnDash && SPACED_EN_DASH.test(text)) return 'spaced en dash';
  const m = text.match(BANNED_PHRASES);
  return m ? `"${m[0]}"` : null;
}

/** @param {import('typescript').Node} node */
function isConsoleArg(node) {
  const ts = tsLib();
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const e = p.expression;
      return ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'console';
    }
  }
  return false;
}

/**
 * "file:line: problem: text" for each renderable string in a .ts/.tsx file that breaks the rules.
 * @param {string} file
 * @param {string} [root]
 * @returns {string[]}
 */
function sourceCopyViolations(file, root = process.cwd()) {
  const ts = tsLib();
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  /** @type {string[]} */
  const hits = [];
  /** @param {import('typescript').Node} node */
  const visit = (node) => {
    const template =
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node);
    if ((template || ts.isStringLiteral(node) || ts.isJsxText(node)) && !isConsoleArg(node)) {
      const problem = copyProblem(node.text, { allowSpacedEnDash: template });
      if (problem) {
        const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
        hits.push(
          `${path.relative(root, file)}:${line + 1}: ${problem}: ${node.text.trim().replace(/\s+/g, ' ').slice(0, 90)}`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return hits;
}

/**
 * "productId.field: problem: text" for the written copy in products.json (criticsTake, loved, gripes).
 * @param {Pick<import('../../src/lib/data-types').Product, 'id' | 'criticsTake' | 'loved' | 'gripes'>[]} products
 * @returns {string[]}
 */
function productCopyViolations(products) {
  return products.flatMap((p) =>
    [
      ['criticsTake', p.criticsTake],
      // Shape errors are reported by validate.js; here a malformed field is just skipped, never a crash.
      ...(Array.isArray(p.loved) ? p.loved : []).map((s, i) => [`loved[${i}]`, s]),
      ...(Array.isArray(p.gripes) ? p.gripes : []).map((s, i) => [`gripes[${i}]`, s]),
    ]
      .filter(([, text]) => typeof text === 'string' && copyProblem(text))
      .map(([field, text]) => `${p.id}.${field}: ${copyProblem(text)}: ${text.slice(0, 90)}`),
  );
}

/** @param {string} dir @returns {string[]} */
function listTsFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => path.join(dir, f));
}

module.exports = { copyProblem, sourceCopyViolations, productCopyViolations, listTsFiles };

// The two model APIs the pipeline calls (OpenAI and Gemini), shared by score-reviews.js and
// refresh.js. Calls use fetch with the key in a header: a key on a curl command line can be
// read from the process list and is echoed in execFileSync's error message.

const OPENAI_MODEL = 'gpt-5.4';
const GEMINI_MODEL = 'gemini-3.1-pro-preview';

/**
 * POST a JSON body and return the parsed reply. An HTTP or API error throws with the status
 * and the API's message, never the request headers.
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {unknown} body
 * @param {number} [timeoutMs]
 * @returns {Promise<any>}
 */
async function postJson(url, headers, body, timeoutMs = 90_000) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    // A cut-off or HTML reply is an error, never an empty answer: an empty answer would
    // read as "no reviews found" and mark the product as checked.
    throw new Error(`HTTP ${res.status}: ${res.ok ? 'reply is not JSON' : res.statusText}`);
  }
  if (!res.ok || out.error) throw new Error(`HTTP ${res.status}: ${out.error?.message ?? res.statusText}`);
  return out;
}

/**
 * The text of an OpenAI chat completion, asked for as a JSON object. Needs OPENAI_API_KEY.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function openaiText(prompt) {
  const out = await postJson(
    'https://api.openai.com/v1/chat/completions',
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    {
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    },
  );
  return out.choices?.[0]?.message?.content || '';
}

/**
 * The text of a Gemini answer. With `search` the model may use Google Search grounding (and
 * then cannot be held to JSON output); without it the answer is JSON. Needs GEMINI_API_KEY.
 * @param {string} prompt
 * @param {{search?: boolean, timeoutMs?: number}} [opts]
 * @returns {Promise<string>}
 */
async function geminiText(prompt, { search = false, timeoutMs } = {}) {
  /** @type {Record<string, unknown> & {generationConfig: Record<string, unknown>}} */
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } };
  if (search) {
    body.tools = [{ google_search: {} }];
    // Discovery returns candidates, not scores. Bound reasoning latency so
    // grounded searches can finish within the four-minute request window.
    body.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  } else body.generationConfig.responseMimeType = 'application/json';
  const out = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
    body,
    timeoutMs,
  );
  return (out.candidates?.[0]?.content?.parts || []).map((/** @type {{text?: string}} */ x) => x.text || '').join('');
}

/**
 * The JSON value in a model reply: the text from the first `open` to the last `close`, parsed.
 * Null when there is none or it does not parse.
 * @param {unknown} s
 * @param {'{' | '['} [open]
 * @returns {any}
 */
function parseJsonReply(s, open = '{') {
  const close = open === '{' ? '}' : ']';
  const t = String(s || '');
  const a = t.indexOf(open);
  const b = t.lastIndexOf(close);
  if (a < 0 || b < a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

module.exports = { OPENAI_MODEL, GEMINI_MODEL, postJson, openaiText, geminiText, parseJsonReply };

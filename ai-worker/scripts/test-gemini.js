// Development only. Never prints credentials, source text or raw provider errors.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { callGemini, DEFAULT_MODEL } from '../src/gemini.js';
let local = {};
try { local = parseEnv(await readFile(new URL('../.dev.vars', import.meta.url), 'utf8')); } catch {}
const key = process.env.GEMINI_API_KEY || local.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || local.GEMINI_MODEL || DEFAULT_MODEL;
const report = { key_present: Boolean(key), model: /^gemini-[a-z0-9.-]{1,80}$/.test(model) ? model : 'custom', http_status: null, call_success: false, parse_success: false };
if (key) {
  try {
    const result = await callGemini({ key, model, system: 'Return only the JSON object requested by the schema.', data: { instruction: 'Return ok=true.' },
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } });
    report.http_status = result.status; report.call_success = true; report.parse_success = result.analysis?.ok === true;
    if (!report.parse_success) process.exitCode = 1;
  } catch (error) { report.http_status = error.status || null; process.exitCode = 1; }
}
console.log(JSON.stringify(report, null, 2));

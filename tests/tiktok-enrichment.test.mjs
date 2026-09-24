import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const normalizeSource = readFileSync("src/lib/creators.functions.ts", "utf8");
const normalization = normalizeSource.slice(normalizeSource.indexOf("const SOCIAL_FIELDS ="), normalizeSource.indexOf("export function creatorImportKeys")).replaceAll("export ", "");
const source = readFileSync("src/lib/tiktok-enrichment.functions.ts", "utf8")
  .replace(/^import .*;\s*$/gm, "")
  .replace(/^export type TikTokEnrichmentRow = \{[\s\S]*?^\};/m, "")
  .replace(/^export /gm, "");
const js = ts.transpileModule(normalization + "\n" + source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
let handler;
const createServerFn = () => ({
  middleware() { return this; },
  inputValidator() { return this; },
  handler(fn) { handler = fn; return fn; },
});
vm.runInNewContext(js, { URL, createServerFn, requireSupabaseAuth: {} });
assert.equal(typeof handler, "function");

function db(records) {
  const writes = [];
  const supabase = { from(table) {
    assert.equal(table, "creators");
    return {
      select() {
        return {
          not() {
            return {
              range(start, end) {
                return Promise.resolve({ data: records.slice(start, end + 1), error: null });
              },
            };
          },
        };
      },
      update(patch) {
        return {
          eq(field, id) {
            assert.equal(field, "id");
            writes.push({ id, patch });
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }};
  return { supabase, writes };
}
const input = (tiktok, overrides = {}) => ({
  tiktok, source_url: "https://www.tiktok.com/@alice/video/123",
  search_term: "emergency food", evidence: "Creator reviewed compact food",
  reach_signal: "TikTok post engagement 200", monetization: "Paid partnership observed",
  segment: "Preparedness", ...overrides,
});
const record = (id, tiktok, overrides = {}) => ({
  id, tiktok, research_notes: null, reach_signal: null, monetization: null, segment: null, ...overrides,
});
async function run(records, rows, dryRun = false) {
  const { supabase, writes } = db(records);
  const result = await handler({ data: { rows, dryRun }, context: { supabase } });
  return { result, writes };
}
let x = await run([record("A", "https://tiktok.com/@Alice")], [input("https://m.tiktok.com/@ALICE/video/123")], true);
assert.equal(x.result.matched, 1);
assert.equal(x.result.updated, 1);
assert.equal(x.writes.length, 0, "preview must never write");

x = await run([record("A", "https://tiktok.com/@alice", {
  reach_signal: "Verified older signal", monetization: "Verified existing partnership",
  research_notes: "Existing research", segment: "Verified segment",
})], [input("https://tiktok.com/@alice")]);
assert.equal(x.result.matched, 1);
assert.equal(x.writes.length, 1);
assert.equal(x.writes[0].patch.reach_signal, undefined, "existing reach must not be replaced");
assert.equal(x.writes[0].patch.monetization, undefined, "existing monetization must not be replaced");
assert.equal(x.writes[0].patch.segment, undefined, "existing segment must not be replaced");
assert.ok(x.writes[0].patch.research_notes.startsWith("Existing research\n"));
assert.equal(x.result.conflicts, 3);

x = await run([record("A", "https://tiktok.com/@alice"), record("B", "https://www.tiktok.com/@ALICE")], [input("https://tiktok.com/@alice")]);
assert.equal(x.result.duplicates, 1);
assert.equal(x.writes.length, 0, "duplicate CRM identities must never be updated");

x = await run([record("A", "https://tiktok.com/@alice")], [
  input("https://tiktok.com/@bob"), input("https://tiktok.com/search?q=food"),
  input("https://tiktok.com/@alice"), input("https://tiktok.com/@ALICE"),
]);
assert.equal(x.result.missing, 1);
assert.equal(x.result.invalid, 1);
assert.equal(x.result.repeated, 1);
assert.equal(x.writes.length, 1);

x = await run([record("A", "https://tiktok.com/@alice", {
  research_notes: "TikTok clipping [emergency food] https://www.tiktok.com/@alice/video/123: Creator reviewed compact food",
  reach_signal: "TikTok post engagement 200", monetization: "Paid partnership observed", segment: "Preparedness",
})], [input("https://tiktok.com/@alice")]);
assert.equal(x.result.unchanged, 1);
assert.equal(x.writes.length, 0, "repeated enrichment should be idempotent");

const large = Array.from({ length: 1201 }, (_, i) => record(String(i), `https://tiktok.com/@user${i}`));
x = await run(large, [input("https://tiktok.com/@user1199")], true);
assert.equal(x.result.matched, 1, "matching must paginate beyond the first 1000 CRM rows");
console.log("TikTok enrichment tests passed: exact match, preview no-write, preserve fields, duplicate block, invalid/missing/repeated, idempotency and pagination.");

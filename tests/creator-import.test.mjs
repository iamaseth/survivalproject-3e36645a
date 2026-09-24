import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync("src/lib/creators.functions.ts", "utf8");
const start = source.indexOf("const SOCIAL_FIELDS =");
const end = source.indexOf("export type ResearchCreatorInput", start);
assert.ok(start >= 0 && end > start);
const snippet = source.slice(start, end).replaceAll("export ", "");
const js = ts.transpileModule(snippet, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
let handler;
const createServerFn = () => ({
  middleware() { return this; },
  inputValidator() { return this; },
  handler(fn) { handler = fn; return fn; },
});
const context = vm.createContext({ URL, createServerFn, requireSupabaseAuth: {} });
vm.runInContext(js + "\nthis.testKeys = creatorImportKeys; this.normalize = normalizeCreatorProfile;", context);
const row = (handle, code = null) => ({
  code, normalized_domain: null, name: handle, segment: null, primary_platforms: "TikTok",
  email: null, facebook: null, instagram: null, tiktok: handle, youtube: null,
  priority: null, amazon: null, research_notes: null, outreach_owner: null,
});
assert.equal(context.normalize("https://www.tiktok.com/@Alice/?lang=en", "tiktok"), "tiktok:@alice");
assert.equal(context.normalize("https://m.tiktok.com/@ALICE/video/123", "tiktok"), "tiktok:@alice");
assert.equal(context.normalize("https://www.tiktok.com/search?q=prepper", "tiktok"), "");
assert.equal(context.normalize("https://evil.example/@alice", "tiktok"), "");
assert.equal(context.normalize("https://www.tiktok.com/@bob", "tiktok"), "tiktok:@bob");

async function run(existing, rows) {
  let inserted = [];
  const supabase = { from(table) {
    assert.equal(table, "creators");
    return {
      select() { return Promise.resolve({ data: existing, error: null }); },
      upsert(items) { inserted = items; return Promise.resolve({ error: null }); },
    };
  }};
  const result = await handler({ data: { rows }, context: { supabase, userId: "test" } });
  return { result, inserted };
}
let x = await run([row("https://tiktok.com/@alice", "OLD")], [
  row("https://www.tiktok.com/@ALICE?lang=en", "NEW"),
  row("https://tiktok.com/@bob", "B1"),
  row("https://m.tiktok.com/@BOB/video/3", "B2"),
]);
assert.equal(x.result.inserted, 1);
assert.equal(x.result.skipped, 2);
assert.equal(x.inserted[0].name, "https://tiktok.com/@bob");
x = await run([row("https://tiktok.com/@alice", "OLD")], [
  { ...row("https://tiktok.com/@alice", "NEW"), instagram: "https://instagram.com/unique" },
  { ...row("https://tiktok.com/@bob", "B1"), instagram: "https://instagram.com/unique" },
]);
assert.equal(x.result.inserted, 1, "skipped row must not reserve Instagram identity");
x = await run([], [row("https://tiktok.com/search?q=prepper", "CODE"), row("https://tiktok.com/@bob")]);
assert.equal(x.result.inserted, 1);
assert.equal(x.result.skipped, 1);
console.log("Creator import normalization, existing-record preservation, batch deduplication and invalid URL tests passed.");

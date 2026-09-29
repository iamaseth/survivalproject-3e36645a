import assert from "node:assert/strict";
import { validateOpenAndPaste as v } from "./validate.mjs";

const good = { creatorId: "c1", platform: "TikTok", profileUrl: "https://www.tiktok.com/@x", message: "hi" };
assert.equal(v(good).ok, true);
assert.equal(v({ ...good, send: true }).status, "send_forbidden");
assert.equal(v({ ...good, profileUrl: "http://www.tiktok.com/@x" }).status, "host_not_allowed");
assert.equal(v({ ...good, profileUrl: "https://evil.com/@x" }).status, "host_not_allowed");
assert.equal(v({ ...good, profileUrl: "https://tiktok.com.evil.com/" }).status, "host_not_allowed");
assert.equal(v({ ...good, message: "a".repeat(2001) }).status, "message_too_long");
assert.equal(v({ ...good, creatorId: "" }).status, "invalid_request");
assert.equal(v(null).status, "invalid_request");
console.log("validate self-test passed");

import { describe, it, expect } from "vitest";
import { createAuthLoadGuard, signInReturnUrl } from "../src/lib/auth-loading";

describe("sign-in session loading", () => {
  it("does not let an older signed-out result replace a newer sign-in", () => {
    const guard = createAuthLoadGuard();
    const old = guard.begin();
    const signedIn = guard.begin();
    expect(guard.isCurrent(old)).toBe(false);
    expect(guard.isCurrent(signedIn)).toBe(true);
  });
  it("invalidates pending profile work on sign-out", () => {
    const guard = createAuthLoadGuard();
    const pending = guard.begin();
    guard.invalidate();
    expect(guard.isCurrent(pending)).toBe(false);
  });
  it("returns installed Rena sign-in to the queue on the same origin", () => {
    expect(signInReturnUrl("https://survivalproject.lovable.app", "/rena-queue", ""))
      .toBe("https://survivalproject.lovable.app/rena-queue");
  });
  it("rejects external return URLs and removes callback credentials", () => {
    expect(signInReturnUrl("https://survivalproject.lovable.app", "//example.com", ""))
      .toBe("https://survivalproject.lovable.app");
    expect(signInReturnUrl("https://survivalproject.lovable.app", "/rena-queue", "?code=test&error=failed"))
      .toBe("https://survivalproject.lovable.app/rena-queue");
  });
});
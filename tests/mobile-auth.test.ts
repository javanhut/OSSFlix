import { beforeEach, describe, expect, test } from "bun:test";
import db from "../scripts/db";
import { authenticateRequest, createSession, hashPassword } from "../scripts/auth";
import { createProfile } from "../scripts/profile";

describe("mobile bearer auth", () => {
  beforeEach(() => {
    db.run("DELETE FROM sessions");
  });

  test("authenticates bearer tokens against the shared sessions table", async () => {
    const profile = createProfile(
      `mobile-bearer-${Date.now()}`,
      await hashPassword("secret"),
      `mobile-${Date.now()}@test.local`,
    );
    const token = createSession(profile.id, "OSSFlix-Mobile-Test");
    const req = new Request("http://localhost/api/mobile/auth/me", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const auth = authenticateRequest(req);

    expect(auth).not.toBeNull();
    expect(auth?.profile.id).toBe(profile.id);
    expect(auth?.sessionId).toBe(token);
  });

  test("still authenticates cookie-backed sessions", async () => {
    const profile = createProfile(
      `cookie-user-${Date.now()}`,
      await hashPassword("secret"),
      `cookie-${Date.now()}@test.local`,
    );
    const token = createSession(profile.id, "OSSFlix-Web-Test");
    const req = new Request("http://localhost/api/auth/me", {
      headers: {
        cookie: `ossflix_session=${token}`,
      },
    });

    const auth = authenticateRequest(req);

    expect(auth).not.toBeNull();
    expect(auth?.profile.id).toBe(profile.id);
  });

  test("rejects malformed bearer headers", () => {
    const req = new Request("http://localhost/api/mobile/auth/me", {
      headers: {
        authorization: "Basic abc123",
      },
    });

    expect(authenticateRequest(req)).toBeNull();
  });
});

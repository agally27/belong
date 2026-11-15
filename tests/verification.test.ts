import { describe, expect, it } from "vitest";
import { inDb, makeMember } from "./helpers";
import { devOutbox } from "@/lib/adapters/notifications";
import { createSession, getUserBySessionToken, login, register } from "@/lib/services/auth";
import { createCircle } from "@/lib/services/circles";
import { listMatches, runNetwork } from "@/lib/services/network";
import { requestIntroduction } from "@/lib/services/introductions";
import { completeOnboarding, updateProfile } from "@/lib/services/profile";
import { setConsent } from "@/lib/services/core";
import { isVerified, requestPasswordReset, resetPassword, sendVerificationEmail, verificationRequired, verifyEmail } from "@/lib/services/verification";

const tokenFor = (email: string, path: string) => {
  const mail = devOutbox.find((m) => m.to === email && m.text.includes(path));
  const url = mail?.text.match(/https?:\/\/\S+/)?.[0];
  return url ? new URL(url).searchParams.get("token") : null;
};
const reg = (email: string) => register({ email, password: "correct-horse-battery", displayName: "Sam", ageConfirmed: true, termsAccepted: true });

describe("email verification", () => {
  it(
    "sends a single-use link on sign-up and blocks contacting people until confirmed",
    inDb(async (db) => {
      expect(verificationRequired()).toBe(true); // demo mode, no email provider → outbox
      const email = `v${Date.now()}@example.test`;
      const { user } = await reg(email);
      expect(await isVerified(user.id)).toBe(false);
      const token = tokenFor(email, "/verify-email")!;
      expect(token).toBeTruthy();
      // Only a hash of the token is stored.
      expect(JSON.stringify(await db.all("SELECT * FROM auth_tokens"))).not.toContain(token);

      for (const k of ["matching_enabled", "share_interests", "share_area"] as const) await setConsent(user.id, k, true);
      await updateProfile(user.id, { displayName: "Sam", interests: ["hiking", "coffee"], postcode: "BS3" });
      await completeOnboarding(user.id);
      await makeMember("Bea", { interests: ["hiking", "coffee"], postcode: "BS3" });
      await runNetwork();
      const [m] = await listMatches(user.id);
      await expect(requestIntroduction(user.id, m.id)).rejects.toThrow(/confirm your email/);
      await expect(createCircle(user.id, { name: "Mine", topic: "hiking", capacity: 4 })).rejects.toThrow(/confirm your email/);

      expect(await verifyEmail(token)).toBe(true);
      expect(await verifyEmail(token)).toBe(false); // single use
      expect(await verifyEmail("not-a-token")).toBe(false);
      expect(await isVerified(user.id)).toBe(true);
      await expect(requestIntroduction(user.id, m.id)).resolves.toBeTruthy();
      expect(await sendVerificationEmail(user.id)).toBe(false); // already confirmed
    }),
  );

  it(
    "expires links and limits how many can be sent",
    inDb(async (db) => {
      const email = `x${Date.now()}@example.test`;
      const { user } = await reg(email);
      const token = tokenFor(email, "/verify-email")!;
      await db.run("UPDATE auth_tokens SET expires_at = ?", [new Date(Date.now() - 1000).toISOString()]);
      expect(await verifyEmail(token)).toBe(false);
      await sendVerificationEmail(user.id);
      await sendVerificationEmail(user.id);
      await expect(sendVerificationEmail(user.id)).rejects.toThrow(/a few links already/);
    }),
  );
});

describe("password reset", () => {
  it(
    "doesn't reveal whether an account exists",
    inDb(async () => {
      const before = devOutbox.length;
      await requestPasswordReset("nobody-here@example.test");
      await requestPasswordReset("");
      expect(devOutbox.length).toBe(before);
    }),
  );

  it(
    "resets once, signs out everywhere, confirms the email, and rejects reused or stale links",
    inDb(async (db) => {
      const email = `r${Date.now()}@example.test`;
      const { user, token: session } = await reg(email);
      const other = await createSession(user.id);
      await requestPasswordReset(email.toUpperCase());
      const token = tokenFor(email, "/reset-password")!;
      await expect(resetPassword(token, "short")).rejects.toThrow(/10 characters/);
      await resetPassword(token, "a-brand-new-password");
      expect(await getUserBySessionToken(session)).toBeNull();
      expect(await getUserBySessionToken(other)).toBeNull();
      await expect(login(email, "correct-horse-battery")).rejects.toThrow();
      expect((await login(email, "a-brand-new-password")).user.id).toBe(user.id);
      expect(await isVerified(user.id)).toBe(true); // they proved they own the inbox
      await expect(resetPassword(token, "another-new-password")).rejects.toThrow(/expired or has already been used/);

      // A second link, left too long, no longer works; and older unused links die after a reset.
      await requestPasswordReset(email);
      const stale = devOutbox.find((m) => m.to === email && m.text.includes("/reset-password"))!.text.match(/token=(\S+)/)![1];
      await db.run("UPDATE auth_tokens SET expires_at = ? WHERE purpose = 'reset' AND used_at IS NULL", [new Date(Date.now() - 1000).toISOString()]);
      await expect(resetPassword(decodeURIComponent(stale), "yet-another-password")).rejects.toThrow(/expired/);
    }),
  );
});

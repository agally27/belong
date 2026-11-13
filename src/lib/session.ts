import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserBySessionToken, SESSION_DAYS, type User } from "./services/auth";

export const SESSION_COOKIE = "belong_session";

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.BELONG_INSECURE_COOKIES !== "true",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => getUserBySessionToken(await sessionToken()));

/** Any signed-in user. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** A signed-in member who has finished onboarding. */
export async function requireMember(): Promise<User> {
  const user = await requireUser();
  if (!user.onboardedAt) redirect(user.role === "admin" ? "/admin" : "/onboarding");
  return user;
}

/** A signed-in administrator. Services re-check the role as well. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export const homeFor = (user: User) => (user.role === "admin" && !user.onboardedAt ? "/admin" : user.onboardedAt ? "/dashboard" : "/onboarding");

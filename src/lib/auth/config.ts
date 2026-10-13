import "server-only";

import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { prisma } from "@/lib/db/client";

/**
 * Auth.js v5 configuration.
 *
 * Sessions are database-backed (the Prisma adapter's default), so signing a
 * user out or removing them actually invalidates their session rather than
 * waiting for a JWT to expire.
 */
export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  pages: { signIn: "/signin" },
  // Vercel serves HTTPS but Auth.js sometimes mis-detects the request protocol
  // (server action vs route handler), which desyncs the `__Secure-` cookie names
  // between the sign-in and callback requests and breaks PKCE with
  // "pkceCodeVerifier value could not be parsed". Force secure cookies in
  // production so both requests agree on the cookie names.
  useSecureCookies: process.env.NODE_ENV === "production",
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  callbacks: {
    /**
     * Puts the database user id on the session. Everything downstream keys off
     * `session.user.id`, never off the email, because an email can change.
     */
    session({ session, user }) {
      if (user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

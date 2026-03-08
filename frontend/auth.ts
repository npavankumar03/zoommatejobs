import { PrismaAdapter } from "@auth/prisma-adapter";
import { type NextAuthConfig } from "next-auth";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { type JWT } from "next-auth/jwt";
import { type JWTPayload, SignJWT, jwtVerify } from "jose";

import { prisma } from "@/lib/prisma";

type GoogleProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const BACKEND_TOKEN_MAX_AGE_SECONDS = 60 * 60;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getJwtSecret(): string {
  return process.env.NEXTAUTH_SECRET ?? "";
}

function normalizeSecret(secret: string | string[] | undefined): string | undefined {
  if (!secret) return undefined;
  return Array.isArray(secret) ? secret[0] : secret;
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

async function signBackendToken(payload: {
  userId: string;
  email?: string | null;
  isAdmin: boolean;
  image?: string | null;
}): Promise<string | undefined> {
  const secret = getJwtSecret();
  if (!secret) return undefined;

  return new SignJWT({
    userId: payload.userId,
    email: payload.email ?? null,
    isAdmin: payload.isAdmin,
    image: payload.image ?? null
  } satisfies JWTPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + BACKEND_TOKEN_MAX_AGE_SECONDS)
    .sign(getSecretKey(secret));
}

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login"
  },
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
      profile(profile) {
        const googleProfile = profile as GoogleProfile;

        return {
          id: googleProfile.sub,
          email: googleProfile.email,
          emailVerified: googleProfile.email_verified ? new Date() : null,
          image: googleProfile.picture,
          fullName: googleProfile.name,
          googleId: googleProfile.sub
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS
  },
  jwt: {
    async encode({ token, secret, maxAge }) {
      if (!token) return "";

      const resolvedSecret = normalizeSecret(secret) ?? getJwtSecret();
      if (!resolvedSecret) return "";

      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresIn = maxAge ?? SESSION_MAX_AGE_SECONDS;

      return new SignJWT(token as JWTPayload)
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + expiresIn)
        .sign(getSecretKey(resolvedSecret));
    },
    async decode({ token, secret }) {
      if (!token) return null;

      const resolvedSecret = normalizeSecret(secret) ?? getJwtSecret();
      if (!resolvedSecret) return null;

      try {
        const { payload } = await jwtVerify(token, getSecretKey(resolvedSecret), {
          algorithms: ["HS256"]
        });

        return payload as JWT;
      } catch {
        return null;
      }
    }
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || account.provider !== "google") return false;

      const googleProfile = profile as GoogleProfile | undefined;
      const googleId = account.providerAccountId;
      const email = googleProfile?.email;

      if (!googleId || !email) {
        return "/login?error=OAuthMissingProfile";
      }

      const [userByGoogleId, userByEmail] = await Promise.all([
        prisma.user.findUnique({ where: { googleId } }),
        prisma.user.findUnique({ where: { email } })
      ]);

      const existingUser = userByGoogleId ?? userByEmail;

      if (!existingUser) {
        const settings = await prisma.adminSettings.findUnique({
          where: { id: "global" },
          select: { allowRegistration: true }
        });

        if (settings && !settings.allowRegistration) {
          return "/login?error=RegistrationDisabled";
        }

        return true;
      }

      if (existingUser.isBanned) {
        return "/login?error=AccountBanned";
      }

      if (userByGoogleId && userByEmail && userByGoogleId.id !== userByEmail.id) {
        return "/login?error=AccountConflict";
      }

      if (userByEmail && !userByGoogleId) {
        await prisma.user.update({
          where: { id: userByEmail.id },
          data: {
            googleId,
            fullName: googleProfile?.name ?? userByEmail.fullName,
            image: googleProfile?.picture ?? userByEmail.image,
            emailVerified: googleProfile?.email_verified ? new Date() : userByEmail.emailVerified
          }
        });
      }

      return true;
    },
    async jwt({ token, user }) {
      const isEdgeRuntime = typeof (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== "undefined";
      const userId = (user?.id as string | undefined) ?? token.userId ?? token.sub;
      const email = (user?.email as string | undefined) ?? token.email;

      if (isEdgeRuntime) {
        const edgeUserId = (token.userId as string | undefined) ?? (token.sub as string | undefined);

        if (edgeUserId) {
          token.userId = edgeUserId;
          token.backendToken =
            (token.backendToken as string | undefined) ??
            (await signBackendToken({
              userId: edgeUserId,
              email: (token.email as string | undefined) ?? null,
              isAdmin: Boolean(token.isAdmin),
              image: (token.image as string | undefined) ?? null
            }));
        }

        return token;
      }

      let dbUser = null;

      if (userId && isUuid(userId)) {
        dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, isAdmin: true, image: true }
        });
      } else if (email) {
        dbUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, isAdmin: true, image: true }
        });
      }

      if (dbUser) {
        token.sub = dbUser.id;
        token.userId = dbUser.id;
        token.email = dbUser.email;
        token.isAdmin = dbUser.isAdmin;
        token.image = dbUser.image;
        token.backendToken = await signBackendToken({
          userId: dbUser.id,
          email: dbUser.email,
          isAdmin: dbUser.isAdmin,
          image: dbUser.image
        });
      }

      return token;
    },
    async session({ session, token }) {
      const userId =
        (token.userId as string | undefined) ??
        (token.sub as string | undefined) ??
        session.user?.id;

      session.user = {
        ...session.user,
        id: userId,
        email: (token.email as string | undefined) ?? session.user?.email ?? null,
        image: (token.image as string | undefined) ?? session.user?.image ?? null,
        isAdmin: Boolean(token.isAdmin)
      };

      session.backendToken = token.backendToken as string | undefined;

      return session;
    }
  }
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

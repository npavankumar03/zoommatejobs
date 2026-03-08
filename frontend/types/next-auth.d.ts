import { DefaultSession } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    backendToken?: string;
    user?: DefaultSession["user"] & {
      id?: string;
      isAdmin: boolean;
    };
  }

  interface User {
    id: string;
    fullName?: string | null;
    googleId?: string;
    isAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId?: string;
    isAdmin?: boolean;
    image?: string | null;
    backendToken?: string;
  }
}

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { refreshSessionToken } from "@/lib/auth/session-user";
import { isAppRole } from "@/lib/auth/roles";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email as string,
          },
        });

        if (!user) {
          return null;
        }

        const passwordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!passwordValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
     return refreshSessionToken(
       token,
       user?.id ?? token.id,
       (id) =>
         prisma.user.findUnique({
           where: { id },
           select: { id: true, name: true, email: true, role: true },
         }),
     );
    },

    async session({ session, token }) {
     if (
       typeof token.id !== "string" ||
       !token.id ||
       !isAppRole(token.role)
     ) {
       throw new Error("The authenticated user session is invalid.");
     }

     session.user.id = token.id;
     session.user.role = token.role;
     return session;
    },
  },

  pages: {
    signIn: "/login",
  },
});
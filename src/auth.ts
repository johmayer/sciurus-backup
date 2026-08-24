import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import Authentik from "next-auth/providers/authentik"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/db";
import bcrypt from "bcryptjs"



// eslint-disable-next-line @typescript-eslint/no-explicit-any
const providers: any[] = []

// 1. OIDC Provider (Authentik)
const authentikIssuer = process.env.AUTHENTIK_ISSUER || process.env.AUTHENTIK_URL
if (process.env.AUTHENTIK_CLIENT_ID && process.env.AUTHENTIK_CLIENT_SECRET && authentikIssuer) {
  providers.push(
    Authentik({
      clientId: process.env.AUTHENTIK_CLIENT_ID,
      clientSecret: process.env.AUTHENTIK_CLIENT_SECRET,
      issuer: authentikIssuer,
    })
  )
}

// 2. Local Credentials Provider
if (process.env.DISABLE_LOCAL_AUTH !== "true") {
  providers.push(
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null
        
        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string }
        })
        
        if (!user || !user.password) return null
        
        const isValid = await bcrypt.compare(credentials.password as string, user.password)
        if (isValid) {
          return { id: user.id, name: user.name || user.username }
        }
        
        return null
      }
    })
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (token?.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized: async ({ auth, request: { nextUrl } }) => {
      // Allow setup route if no users exist
      if (nextUrl.pathname.startsWith('/setup')) {
        return true;
      }
      return !!auth;
    },
  },
  pages: {
    signIn: '/login',
  }
})

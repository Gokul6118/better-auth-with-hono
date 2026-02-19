import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getDb, user, session, account } from '@repo/db'

const AUTH_SECRET = process.env.BETTER_AUTH_SECRET
const APP_URL = process.env.APP_URL

console.log("🔐 AUTH_SECRET:", AUTH_SECRET)
console.log("🌐 APP_URL:", APP_URL)

if (!AUTH_SECRET) {
  throw new Error(
    "❌ BETTER_AUTH_SECRET is missing. Check your root .env file."
  )
}

if (!APP_URL) {
  throw new Error(
    "❌ APP_URL is missing. Check your root .env file."
  )
}

let dbAuth: any
try {
  dbAuth = getDb()
} catch (error) {
  console.error('❌ Database initialization failed for auth:', error)
}

export const auth = betterAuth({
  database: drizzleAdapter(dbAuth, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
    },
  }),
  secret: AUTH_SECRET,
  baseURL: APP_URL,
  emailAndPassword: {
    enabled: true,
  },
})

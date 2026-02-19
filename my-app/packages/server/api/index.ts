import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import {
  setSignedCookie,
  deleteCookie,
  getSignedCookie,
} from 'hono/cookie'

import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

import {
  describeRoute,
  resolver,
  validator,
  openAPIRouteHandler,
} from 'hono-openapi'

import { Scalar } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'

import { z } from 'zod'

import { getDb, todos, user, session, account } from '@repo/db'
import { eq, and, sql } from 'drizzle-orm'

import { handle } from 'hono/vercel'

import {
  signupSchema,
  loginSchema,
  patchTodoSchema,
} from '@repo/schemas'

import { todoFormSchema } from "@repo/schemas"

// ==================== AUTH SETUP ====================
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

const auth = betterAuth({
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

// ==================== APP SETUP ====================

const JWT_SECRET = process.env.JWT_SECRET!
const COOKIE_SECRET = process.env.COOKIE_SECRET!

let db: any

try {
  db = getDb()
} catch (error) {
  console.error('❌ Database initialization failed:', error)
  db = null
}

type Variables = {
  userId: number
  role: string
}



const app = new Hono<{ Variables: Variables }>().basePath('/api')

app.use('*', logger())

app.use(
  '*',
  cors({
    origin: 'https://your-frontend-domain.com',
    credentials: true,
  })
)

// Better Auth handler
app.on(['POST', 'GET'], 'auth/*', (c) => {
  return auth.handler(c.req.raw)
})

// ================= SCHEMAS =================

const idParamSchema = z.object({
  id: z.string(),
})

// ================= ROUTES =================

// Admin: User count
app.get('/admin/user-count', async (c) => {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(user)

  return c.json({ totalUsers: result[0].count })
})

// Current user
app.get('/me', (c) => {
  return c.json({
    id: c.get('userId'),
    role: c.get('role'),
  })
})

app.get(
  '/',

  describeRoute({
    description: 'Get all todos for current user',

    responses: {
      200: { description: 'List of todos' },
      401: { description: 'Unauthorized' },
    },
  }),

  async (c) => {
    const userId = c.get('userId')

    const data = await db
      .select()
      .from(todos)
      .where(eq(todos.userId, userId))

    return c.json(data)
  }
)

// CREATE
app.post(
  '/',

  describeRoute({
    description: 'Create todo',

    responses: {
      201: { description: 'Created' },
      400: { description: 'Validation error' },
      401: { description: 'Unauthorized' },
    },
  }),

  validator('json', todoFormSchema, (result, c) => {
    if (!result.success) {
      return c.json(result.error, 400)
    }
  }),

  async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')

    const startAt = new Date(
      `${body.startDate}T${body.startTime}`
    )

    const endAt = new Date(
      `${body.endDate}T${body.endTime}`
    )

    const [todo] = await db
      .insert(todos)
      .values({
        text: body.text,
        description: body.description,
        status: body.status,
        startAt,
        endAt,
        userId,
      })
      .returning()

    return c.json({ success: true, data: todo }, 201)
  }
)

// UPDATE
app.put(
  '/:id',

  describeRoute({
    description: 'Update todo',

    responses: {
      200: { description: 'Updated' },
      404: { description: 'Not found' },
    },
  }),

  validator('param', idParamSchema),

  validator('json', todoFormSchema, (result, c) => {
    if (!result.success) {
      return c.json(result.error, 400)
    }
  }),

  async (c) => {
    const userId = c.get('userId')
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')

    const startAt = new Date(
      `${body.startDate}T${body.startTime}`
    )

    const endAt = new Date(
      `${body.endDate}T${body.endTime}`
    )

    const [todo] = await db
      .update(todos)
      .set({
        ...body,
        startAt,
        endAt,
      })
      .where(
        and(
          eq(todos.id, Number(id)),
          eq(todos.userId, userId)
        )
      )
      .returning()

    if (!todo) {
      return c.json({ message: 'Not found' }, 404)
    }

    return c.json({ success: true, data: todo })
  }
)

// DELETE
app.delete(
  '/:id',

  describeRoute({
    description: 'Delete todo',

    responses: {
      200: { description: 'Deleted' },
      404: { description: 'Not found' },
    },
  }),

  validator('param', idParamSchema),

  async (c) => {
    const userId = c.get('userId')
    const { id } = c.req.valid('param')

    const result = await db
      .delete(todos)
      .where(
        and(
          eq(todos.id, Number(id)),
          eq(todos.userId, userId)
        )
      )

    if (!result.rowCount) {
      return c.json({ message: 'Not found' }, 404)
    }

    return c.json({ message: 'Deleted' })
  }
)

// PATCH
app.patch(
  '/:id',

  describeRoute({
    description: 'Patch todo',

    responses: {
      200: { description: 'Updated successfully' },
      400: { description: 'Validation error' },
      404: { description: 'Not found' },
    },
  }),

  validator('param', idParamSchema),

  validator('json', patchTodoSchema, (result, c) => {
    if (!result.success) {
      return c.json(result.error, 400)
    }
  }),

  async (c) => {
    const userId = c.get('userId')
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')

    const [todo] = await db
      .update(todos)
      .set(body)
      .where(
        and(
          eq(todos.id, Number(id)),
          eq(todos.userId, userId)
        )
      )
      .returning()

    if (!todo) {
      return c.json({ message: 'Todo not found' }, 404)
    }

    return c.json({
      success: true,
      data: todo,
    })
  }
)

// ================= OPENAPI =================

app.get(
  '/openapi',

  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: 'Todo API',
        version: '1.0.0',
        description: 'Hono + Zod + OpenAPI + Scalar',
      },

      servers: [
        {
          url: 'http://localhost:3000',
        },
      ],
    },
  })
)

// Docs
app.get(
  '/docs',

  Scalar({
    url: '/api/openapi',
  })
)


export default handle(app)


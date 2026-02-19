import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { z } from 'zod'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

import {
  describeRoute,
  validator,
  openAPIRouteHandler,
} from 'hono-openapi'

import { Scalar } from '@scalar/hono-api-reference'

import { getDb, todos, user, session, account } from '@repo/db'
import { eq, sql, and } from 'drizzle-orm'

import { handle } from 'hono/vercel'

import {
  signupSchema,
  loginSchema,
  patchTodoSchema,
  todoFormSchema,
} from '@repo/schemas'

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

// ================= DB =================

const db = getDb()

// ================= TYPES =================

type Variables = {
  userId: string // UUID only
}

// ================= APP =================

const app = new Hono<{ Variables: Variables }>().basePath('/api')

// ================= LOGGER =================

app.use('*', logger())

// ================= CORS =================

app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3001',
      'https://better-auth-app-web.vercel.app',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
)

// ================= PREFLIGHT =================

app.options('*', (c) => c.body(null, 204))

// ================= AUTH HANDLER =================

app.all('/auth/*', (c) => auth.handler(c.req.raw))


app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth")) {
    return next();
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers, 
  });


  if (!session) {
    return c.json({ message: "Login required" }, 401);
  }

  c.set("userId", session.user.id);

  await next();
});



app.get('/admin/user-count', async (c) => {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(user)

  return c.json({ totalUsers: result[0].count })
})


app.get(
  '/',
  describeRoute({
    description: 'Get user todos',
    responses: {
      200: { description: 'Todos list' },
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

// CREATE TODO
app.post(
  '/',
  describeRoute({
    description: 'Create todo',
    responses: {
      201: { description: 'Created' },
      400: { description: 'Validation error' },
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

    const startAt = new Date(`${body.startDate}T${body.startTime}`)
    const endAt = new Date(`${body.endDate}T${body.endTime}`)

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

app.put(
  '/:id',

  validator('param', z.object({ id: z.string() })),
  validator('json', todoFormSchema),

  async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const userId = c.get('userId')

    const startAt = new Date(`${body.startDate}T${body.startTime}`)
    const endAt = new Date(`${body.endDate}T${body.endTime}`)

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
      return c.json({ message: 'Not found or unauthorized' }, 404)
    }

    return c.json({ success: true, data: todo })
  }
)

// PATCH TODO
app.patch(
  '/:id',

  describeRoute({
    description: 'Patch todo',
    responses: {
      200: { description: 'Updated' },
      404: { description: 'Not found' },
    },
  }),

  validator('param', z.object({ id: z.string() })),

  validator('json', patchTodoSchema, (result, c) => {
    if (!result.success) {
      return c.json(result.error, 400)
    }
  }),

  async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const userId = c.get('userId')

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
      return c.json({ message: 'Not found or unauthorized' }, 404)
    }

    return c.json({ success: true, data: todo })
  }
)

// DELETE TODO
app.delete(
  '/:id',

  validator('param', z.object({ id: z.string() })),

  async (c) => {
    const { id } = c.req.valid('param')
    const userId = c.get('userId')

    const result = await db
      .delete(todos)
      .where(
        and(
          eq(todos.id, Number(id)),
          eq(todos.userId, userId)
        )
      )

    if (!result.rowCount) {
      return c.json({ message: 'Not found or unauthorized' }, 404)
    }

    return c.json({ message: 'Deleted successfully' })
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
      servers: [{ url: 'http://localhost:3000' }],
    },
  })
)

// ================= DOCS =================

app.get(
  '/docs',

  Scalar({
    url: '/api/openapi',
  })
)

app.get('/', (c) => {
  return c.json({ message: 'API Server is running', version: '1.0.0' })
})

// ================= SERVER =================

export default handle(app)

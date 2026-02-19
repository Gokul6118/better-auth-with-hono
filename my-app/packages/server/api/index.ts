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

console.log("🔐 AUTH_SECRET:", AUTH_SECRET ? 'SET' : 'MISSING')
console.log("🌐 APP_URL:", APP_URL)

if (!AUTH_SECRET) {
  console.error("❌ BETTER_AUTH_SECRET is missing")
}

if (!APP_URL) {
  console.error("❌ APP_URL is missing")
}

let dbAuth: any = null
let auth: any = null

// Lazy initialize auth - only when needed
function initAuth() {
  if (auth) return auth
  
  try {
    dbAuth = getDb()
    auth = betterAuth({
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
    console.log("✅ Auth initialized")
    return auth
  } catch (error) {
    console.error('❌ Auth initialization failed:', error)
    return null
  }
}

// ================= DB =================

let db: any = null

function initDb() {
  if (db) return db
  try {
    db = getDb()
    console.log("✅ Database initialized")
    return db
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    return null
  }
}

// ================= TYPES =================

type Variables = {
  userId: string // UUID only
}

// ================= APP =================

const app = new Hono<{ Variables: Variables }>().basePath('/api')

// ================= BARE TEST ROUTES - NO MIDDLEWARE =================

// Simplest possible endpoint - test if server responds at all
app.get('/ping', (c) => {
  return c.text('pong')
})

app.get('/test', (c) => {
  return c.json({ test: 'ok' })
})

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

// ================= MIDDLEWARE - SIMPLE VERSION =================

app.use("*", async (c, next) => {
  // Skip auth check for these public routes - public paths check FIRST
  if (c.req.path === '/health' || c.req.path === '/' || c.req.path === '/ping' || c.req.path === '/test' || c.req.path.startsWith('/auth')) {
    return next();
  }

  // For all other routes that require auth
  if (c.req.path.startsWith('/admin') || c.req.path.startsWith('/todos')) {
    try {
      const authInstance = initAuth();
      if (!authInstance) {
        return c.json({ message: "Auth not available" }, 503);
      }

      const session = await authInstance.api.getSession({
        headers: c.req.raw.headers, 
      });

      if (!session) {
        return c.json({ message: "Login required" }, 401);
      }

      c.set("userId", session.user.id);
    } catch (error) {
      console.error("Auth error:", error);
      return c.json({ message: "Authentication required" }, 401);
    }
  }

  await next();
});

// ================= ROUTES =================

// Root endpoint - quick test - MUST RETURN IMMEDIATELY
app.get('/', (c) => {
  const response = { 
    message: 'API Server is running', 
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }
  return c.json(response)
})

// ================= HEALTH CHECK =================

// Public endpoint - MUST RETURN IMMEDIATELY
app.get('/health', (c) => {
  const response = { 
    status: 'ok', 
    message: 'Server is healthy',
    timestamp: new Date().toISOString()
  }
  return c.json(response)
})

// ================= AUTH HANDLER =================

app.all('/auth/*', (c) => auth.handler(c.req.raw))



app.get('/admin/user-count', async (c) => {
  const dbInstance = initDb()
  if (!dbInstance) {
    return c.json({ error: 'Database not available' }, 503)
  }
  
  const result = await dbInstance
    .select({ count: sql<number>`count(*)` })
    .from(user)

  return c.json({ totalUsers: result[0].count })
})

// GET todos - requires authentication
app.get(
  '/todos',
  describeRoute({
    description: 'Get user todos',
    responses: {
      200: { description: 'Todos list' },
    },
  }),

  async (c) => {
    const userId = c.get('userId')
    const dbInstance = initDb()
    if (!dbInstance) {
      return c.json({ error: 'Database not available' }, 503)
    }

    const data = await dbInstance
      .select()
      .from(todos)
      .where(eq(todos.userId, userId))

    return c.json(data)
  }
)

// CREATE TODO
app.post(
  '/todos',
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
    const dbInstance = initDb()
    if (!dbInstance) {
      return c.json({ error: 'Database not available' }, 503)
    }

    const startAt = new Date(`${body.startDate}T${body.startTime}`)
    const endAt = new Date(`${body.endDate}T${body.endTime}`)

    const [todo] = await dbInstance
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
  '/todos/:id',

  validator('param', z.object({ id: z.string() })),
  validator('json', todoFormSchema),

  async (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const userId = c.get('userId')
    const dbInstance = initDb()
    if (!dbInstance) {
      return c.json({ error: 'Database not available' }, 503)
    }

    const startAt = new Date(`${body.startDate}T${body.startTime}`)
    const endAt = new Date(`${body.endDate}T${body.endTime}`)

    const [todo] = await dbInstance
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
  '/todos/:id',

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
    const dbInstance = initDb()
    if (!dbInstance) {
      return c.json({ error: 'Database not available' }, 503)
    }

    const [todo] = await dbInstance
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
  '/todos/:id',

  validator('param', z.object({ id: z.string() })),

  async (c) => {
    const { id } = c.req.valid('param')
    const userId = c.get('userId')
    const dbInstance = initDb()
    if (!dbInstance) {
      return c.json({ error: 'Database not available' }, 503)
    }

    const result = await dbInstance
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

// ================= SERVER =================

export default handle(app)

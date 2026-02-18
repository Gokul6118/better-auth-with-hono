import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serve } from "@hono/node-server";
import {
  setSignedCookie,
  deleteCookie,
  getSignedCookie,
} from 'hono/cookie'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { auth } from "./../auth";
import {
  describeRoute,
  resolver,
  validator,
  openAPIRouteHandler,
} from 'hono-openapi'

import { Scalar } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'

import { z } from 'zod'

import { getDb, todos, user } from '@repo/db'
import { eq, and, sql } from 'drizzle-orm'

// 👉 Import your schemas
import {
  signupSchema,
  loginSchema,
  patchTodoSchema
} from './../../schemas/auth.schema'

import { todoFormSchema } from './../../schemas/todo.schema'



const JWT_SECRET = process.env.JWT_SECRET!
const COOKIE_SECRET = process.env.COOKIE_SECRET!

const db = getDb()

type Variables = {
  userId: number
  role: string
}

const app = new Hono<{ Variables: Variables }>().basePath('/api')

app.use('*', logger())

app.on(["POST", "GET"], "auth/*", (c) => {
	return auth.handler(c.req.raw);
});

const idParamSchema = z.object({
  id: z.string(),
})
app.use(
  '*',
  cors({
    origin: 'https://your-frontend-domain.com',
    credentials: true,
  })
)


// // ================= MIDDLEWARE =================

// const authMiddleware = async (c: any, next: any) => {
//   try {
//     const token = await getSignedCookie(
//       c,
//       COOKIE_SECRET,
//       'auth_token'
//     )

//     if (!token) {
//       return c.json({ message: 'Login required' }, 401)
//     }

//     const decoded = jwt.verify(token, JWT_SECRET) as {
//       userId: number
//       role: string
//     }

//     c.set('userId', decoded.userId)
//     c.set('role', decoded.role)

//     await next()
//   } catch {
//     return c.json({ message: 'Invalid token' }, 401)
//   }
// }

// const adminMiddleware = async (c: any, next: any) => {
//   if (c.get('role') !== 'admin') {
//     return c.json({ message: 'Admins only' }, 403)
//   }

//   await next()
// }

// // ================= AUTH =================

// // SIGNUP
// app.post(
//   '/signup',

//   describeRoute({
//     description: 'Register new user',

//     request: {
//       body: {
//         content: {
//           'application/json': {
//             schema: resolver(signupSchema),
//           },
//         },
//       },
//     },

//     responses: {
//       200: { description: 'Signup success' },
//       400: { description: 'User exists' },
//     },
//   }),

//   validator('json', signupSchema, (result, c) => {
//     if (!result.success) {
//       return c.json(result.error.flatten(), 400)
//     }
//   }),

//   async (c) => {
//     const { email, password } = c.req.valid('json')

//     const exists = await db
//       .select()
//       .from(user)
//       .where(eq(user.email, email))

//     if (exists.length) {
//       return c.json({ message: 'User exists' }, 400)
//     }

//     const hashed = await bcrypt.hash(password, 10)

//     await db.insert(user).values({
//       email,
//       password: hashed,
//       role: 'user',
//     })

//     return c.json({ message: 'Signup success' })
//   }
// )

// // LOGIN
// app.post(
//   '/login',

//   describeRoute({
//     description: 'Login user',

//     request: {
//       body: {
//         content: {
//           'application/json': {
//             schema: resolver(loginSchema),
//           },
//         },
//       },
//     },

//     responses: {
//       200: { description: 'Login success' },
//       401: { description: 'Invalid credentials' },
//     },
//   }),

//   validator('json', loginSchema, (result, c) => {
//     if (!result.success) {
//       return c.json(result.error.flatten(), 400)
//     }
//   }),

//   async (c) => {
//     const { email, password } = c.req.valid('json')

//     const result = await db
//       .select()
//       .from(user)
//       .where(eq(user.email, email))

//     if (!result.length) {
//       return c.json({ message: 'Invalid credentials' }, 401)
//     }

//     const u = result[0]

//     const valid = await bcrypt.compare(password, u.password)

//     if (!valid) {
//       return c.json({ message: 'Invalid credentials' }, 401)
//     }

//     const token = jwt.sign(
//       {
//         userId: u.id,
//         role: u.role,
//       },
//       JWT_SECRET,
//       { expiresIn: '24h' }
//     )

//     await setSignedCookie(c, 'auth_token', token, COOKIE_SECRET, {
//       httpOnly: true,
//       secure: false,
//       sameSite: 'Lax',
//       path: '/',
//     })

//     return c.json({ success: true })
//   }
// )


// app.post('/logout', authMiddleware, (c) => {
//   deleteCookie(c, 'auth_token', { path: '/' })

//   return c.json({ message: 'Logged out' })
// })

// filepath: /home/gokul/weekly-authentication-and-authorization/my-app/packages/server/src/index.ts
// ...existing code...



app.get(
  '/admin/user-count',

  
  async (c) => {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(user)

    return c.json({ totalUsers: result[0].count })
  }
)





app.get('/me',  (c) => {
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
      200: {
        description: 'List of todos',
      },
      401: {
        description: 'Unauthorized',
      },
    },
  }),

  async (c) => {
    const userId = c.get('userId');

    const data = await db
      .select()
      .from(todos)
      .where(eq(todos.userId, userId));

    return c.json(data);
  }
);

// CREATE
app.post(
  '/',


  describeRoute({
    description: 'Create todo',

    request: {
      body: {
        content: {
          'application/json': {
            schema: resolver(todoFormSchema),
          },
        },
      },
    },

    responses: {
      201: { description: 'Created' },
      400: { description: 'Validation error' },
      401: { description: 'Unauthorized' },
    },
  }),

  validator('json', todoFormSchema, (result, c) => {
    if (!result.success) {
      return c.json(result.error.flatten(), 400)
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

    request: {
      params: resolver(idParamSchema),

      body: {
        content: {
          'application/json': {
            schema: resolver(todoFormSchema),
          },
        },
      },
    },

    responses: {
      200: { description: 'Updated' },
      404: { description: 'Not found' },
    },
  }),

  validator('param', idParamSchema),
  validator('json', todoFormSchema, (result, c) => {
    if (!result.success) {
      return c.json(result.error.flatten(), 400)
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

    request: {
      params: resolver(idParamSchema),
    },

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


app.patch(
  '/:id',

  describeRoute({
    description: 'Patch todo (partial update)',

    request: {
      params: resolver(idParamSchema),

      body: {
        content: {
          'application/json': {
            schema: resolver(patchTodoSchema),
          },
        },
      },
    },

    responses: {
      200: { description: 'Updated successfully' },
      400: { description: 'Validation error' },
      401: { description: 'Unauthorized' },
      404: { description: 'Not found' },
    },
  }),

  validator('param', idParamSchema),

  validator('json', patchTodoSchema, (result, c) => {
    if (!result.success) {
      return c.json(result.error.flatten(), 400)
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


app.get(
  '/docs',

  Scalar({
    url: '/api/openapi',
  })
)



export { app }

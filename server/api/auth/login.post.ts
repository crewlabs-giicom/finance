import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')

  if (!email || !password) throw createError({ statusCode: 400, statusMessage: 'Email dan password wajib diisi.' })

  const user = await db.select().from(users).where(eq(users.email, email)).get()
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Email atau password salah.' })

  const valid = await verifyPassword(user.passwordHash, password)
  if (!valid) throw createError({ statusCode: 401, statusMessage: 'Email atau password salah.' })

  await setUserSession(event, { user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  return { id: user.id, name: user.name, email: user.email, role: user.role }
})

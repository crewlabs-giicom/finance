import { eq, count } from 'drizzle-orm'
import { users } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Nama wajib diisi.' })
  if (!email || !email.includes('@')) throw createError({ statusCode: 400, statusMessage: 'Email gak valid.' })
  if (password.length < 6) throw createError({ statusCode: 400, statusMessage: 'Password minimal 6 karakter.' })

  const existing = await db.select().from(users).where(eq(users.email, email)).get()
  if (existing) throw createError({ statusCode: 409, statusMessage: 'Email ini udah kedaftar.' })

  const [{ total }] = await db.select({ total: count() }).from(users)
  const role = total === 0 ? 'admin' : 'staff' // orang pertama daftar otomatis jadi admin

  const passwordHash = await hashPassword(password)
  const id = genId('u')
  await db.insert(users).values({ id, name, email, passwordHash, role })

  await setUserSession(event, { user: { id, name, email, role } })
  return { id, name, email, role }
})

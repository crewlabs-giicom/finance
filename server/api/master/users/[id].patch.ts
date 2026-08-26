import { eq } from 'drizzle-orm'
import { users } from '../../../database/schema'

// Sengaja cuma bisa ganti picId lewat sini — bukan email/password/role.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event) || {}
  if (body.picId === undefined) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })
  await db.update(users).set({ picId: body.picId || null }).where(eq(users.id, id))
  return { ok: true }
})

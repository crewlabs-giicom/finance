import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'

// picId diambil fresh dari DB (bukan dari cookie sesi) supaya gak basi kalau
// admin baru aja ganti PIC user ini di Master Data setelah dia login.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const [row] = await db.select({ picId: users.picId }).from(users).where(eq(users.id, user.id)).limit(1)
  return { id: user.id, name: user.name, email: user.email, role: user.role, picId: row?.picId ?? null }
})

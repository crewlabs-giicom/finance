import { asc } from 'drizzle-orm'
import { users } from '../../../database/schema'

// Cuma buat nge-link user ke PIC di Master Data — passwordHash sengaja gak diikutin.
export default defineEventHandler(async () => {
  return await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    picId: users.picId
  }).from(users).orderBy(asc(users.name))
})

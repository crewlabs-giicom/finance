import { asc } from 'drizzle-orm'
import { pics } from '../../../database/schema'

export default defineEventHandler(async () => {
  return await db.select().from(pics).orderBy(asc(pics.urutan), asc(pics.nama))
})

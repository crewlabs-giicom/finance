import { asc } from 'drizzle-orm'
import { bankGroups } from '../../../database/schema'

export default defineEventHandler(async () => {
  return await db.select().from(bankGroups).orderBy(asc(bankGroups.urutan), asc(bankGroups.nama))
})

import { depositoRows } from '../../../database/schema'

export default defineEventHandler(async () => {
  return await db.select().from(depositoRows).all()
})

import { rowColors } from '../../database/schema'

export default defineEventHandler(async () => {
  return await db.select().from(rowColors)
})

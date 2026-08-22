import { hutangRows } from '../../../database/schema'

export default defineEventHandler(async () => {
  return await db.select().from(hutangRows)
})

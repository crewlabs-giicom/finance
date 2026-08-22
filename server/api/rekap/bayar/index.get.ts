import { bayarRows } from '../../../database/schema'

export default defineEventHandler(async () => {
  return await db.select().from(bayarRows)
})

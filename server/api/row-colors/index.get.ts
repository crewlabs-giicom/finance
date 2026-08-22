import { rowColors } from '../../database/schema'

export default defineEventHandler(async () => {
  return db.select().from(rowColors).all()
})

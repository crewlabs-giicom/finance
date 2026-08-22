import { tagMaster } from '../../../database/schema'

export default defineEventHandler(async () => {
  return db.select().from(tagMaster).all()
})

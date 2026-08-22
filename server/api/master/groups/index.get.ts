import { bankGroups } from '../../../database/schema'

export default defineEventHandler(async () => {
  return db.select().from(bankGroups).all()
})

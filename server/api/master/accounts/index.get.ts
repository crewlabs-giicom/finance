import { bankAccounts } from '../../../database/schema'

export default defineEventHandler(async () => {
  return db.select().from(bankAccounts).all()
})

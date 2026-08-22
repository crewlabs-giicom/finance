import { bankTxns } from '../../database/schema'

export default defineEventHandler(async () => {
  return db.select().from(bankTxns).all()
})

import { bankBalances } from '../../database/schema'

// Nge-nol-in kolom Saldo semua rekening bank — dipakai tim tiap pagi sebelum update data baru.
export default defineEventHandler(async () => {
  await db.update(bankBalances).set({ saldo: 0 })
  return { ok: true }
})

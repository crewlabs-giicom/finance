import { eq } from 'drizzle-orm'
import { bankBalances } from '../../database/schema'

// Nge-nol-in kolom Saldo semua rekening bank — dipakai tim tiap pagi sebelum update data baru.
// Bisa Dipakai ikut di-reset karena itu rumus turunan dari saldo (0 kalau saldo 0).
// Baris yang digembok dilewati, gak ikut ke-reset.
export default defineEventHandler(async () => {
  await db.update(bankBalances).set({ saldo: 0, bisaDipakai: 0 }).where(eq(bankBalances.locked, false))
  return { ok: true }
})

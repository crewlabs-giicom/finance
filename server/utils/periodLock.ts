import { periodLock } from '../database/schema'

export async function getPeriodLockYm(): Promise<string | null> {
  const [row] = await db.select().from(periodLock).limit(1)
  return row?.lockYm || null
}

export async function assertNotLocked(dateStr: string | null | undefined) {
  if (!dateStr) return
  const lockYm = await getPeriodLockYm()
  if (!lockYm) return
  if (dateStr.slice(0, 7) <= lockYm) {
    throw createError({
      statusCode: 423,
      statusMessage: `Periode ini udah dikunci sampai ${lockYm}. Data di bulan itu ke bawah gak bisa ditambah/diubah/dihapus lagi.`
    })
  }
}

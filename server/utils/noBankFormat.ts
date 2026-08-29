import { eq, inArray } from 'drizzle-orm'
import { bankAccounts } from '../database/schema'

/**
 * Auto-generate kolom "No Bank" di Rincian Bank dari format prefix yang diset per rekening
 * di Master Data (mis. "BKCA/" -> "BKCA/2026/08/"). Tahun/bulan diambil dari tanggal
 * transaksi itu sendiri (bukan tanggal hari ini).
 */

function buildPrefix(format: string, tanggal: string): string {
  const year = tanggal.slice(0, 4)
  const month = tanggal.slice(5, 7)
  return `${format}${year}/${month}/`
}

/** Sisi mana yang keisi di satu baris transaksi bank. */
export function noBankSide(debet: number, kredit: number): 'debet' | 'kredit' | null {
  if (debet > 0) return 'debet'
  if (kredit > 0) return 'kredit'
  return null
}

/** Generate No Bank buat SATU transaksi (dipakai tambah-manual & patch). */
export async function generateNoBank(accountId: string, side: 'debet' | 'kredit', tanggal: string): Promise<string | null> {
  const [acc] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).limit(1)
  if (!acc) return null
  const format = side === 'debet' ? acc.noBankFormatDebet : acc.noBankFormatKredit
  if (!format) return null
  return buildPrefix(format, tanggal)
}

/** Generate No Bank buat BANYAK baris sekaligus (dipakai import CSV). */
export async function generateNoBankBatch(
  rows: { accountId: string; debet: number; kredit: number; tanggal: string }[]
): Promise<(string | null)[]> {
  const accountIds = [...new Set(rows.map(r => r.accountId))]
  const accs = accountIds.length ? await db.select().from(bankAccounts).where(inArray(bankAccounts.id, accountIds)) : []
  const accMap = new Map(accs.map(a => [a.id, a]))

  return rows.map((r) => {
    const side = noBankSide(r.debet, r.kredit)
    const acc = accMap.get(r.accountId)
    const format = !acc || !side ? null : (side === 'debet' ? acc.noBankFormatDebet : acc.noBankFormatKredit)
    if (!side || !acc || !format) return null
    return buildPrefix(format, r.tanggal)
  })
}

import { and, eq, inArray, like } from 'drizzle-orm'
import { bankAccounts, bankTxns } from '../database/schema'

/**
 * Auto-generate kolom "No Bank" di Rincian Bank dari format prefix yang diset per rekening
 * di Master Data (mis. "BKCA/" -> "BKCA/2026/08/001"). Tahun/bulan diambil dari tanggal
 * transaksi itu sendiri (bukan tanggal hari ini). Nomor urut di belakangnya nerusin dari
 * nomor TERBESAR yang udah ada di database buat kombinasi rekening+prefix yang sama —
 * bukan mulai dari 1 lagi tiap kali.
 */

function buildPrefix(format: string, tanggal: string): string {
  const year = tanggal.slice(0, 4)
  const month = tanggal.slice(5, 7)
  return `${format}${year}/${month}/`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Nomor urut terbesar yang udah kepake buat satu prefix di satu rekening, plus lebar
 *  padding-nya (ngikutin yang udah ada, minimal 3 digit) — dipakai buat nentuin nomor
 *  berikutnya. Baris No Bank lama yang gak cocok pola "prefix+angka" dilewatin aja. */
async function maxSeqForPrefix(accountId: string, prefix: string): Promise<{ next: number; padWidth: number }> {
  const rows = await db.select({ noBankManual: bankTxns.noBankManual })
    .from(bankTxns)
    .where(and(eq(bankTxns.accountId, accountId), like(bankTxns.noBankManual, `${prefix}%`)))
  const re = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`)
  let max = 0
  let width = 3
  for (const r of rows) {
    const m = (r.noBankManual || '').match(re)
    if (!m) continue
    const n = parseInt(m[1]!, 10)
    if (n > max) max = n
    if (m[1]!.length > width) width = m[1]!.length
  }
  return { next: max + 1, padWidth: width }
}

/** Sisi mana yang keisi di satu baris transaksi bank. */
export function noBankSide(debet: number, kredit: number): 'debet' | 'kredit' | null {
  if (debet > 0) return 'debet'
  if (kredit > 0) return 'kredit'
  return null
}

/** Baris "BIAYA TXN" (biaya BI-FAST dari bank) selalu nempel tepat di bawah transaksi
 *  aslinya di file mutasi — No Bank-nya ngikutin baris di atasnya, bukan nomor urut baru. */
function isTxnFee(transaksi: string | null | undefined): boolean {
  return !!transaksi && /\btxn\b/i.test(transaksi)
}

/** Generate No Bank buat SATU transaksi (dipakai tambah-manual & patch). */
export async function generateNoBank(accountId: string, side: 'debet' | 'kredit', tanggal: string): Promise<string | null> {
  const [acc] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).limit(1)
  if (!acc) return null
  const format = side === 'debet' ? acc.noBankFormatDebet : acc.noBankFormatKredit
  if (!format) return null
  const prefix = buildPrefix(format, tanggal)
  const { next, padWidth } = await maxSeqForPrefix(accountId, prefix)
  return `${prefix}${String(next).padStart(padWidth, '0')}`
}

/** Generate No Bank buat BANYAK baris sekaligus (dipakai import CSV).
 *
 *  Satu batch bisa punya banyak baris baru dengan prefix yang sama (mis. 10 transaksi
 *  debet di bulan yang sama) — gak bisa query database ulang per baris (nomornya bakal
 *  kembar semua). Jadi tiap kombinasi rekening+prefix cuma di-query SEKALI buat dapet
 *  nomor awal, abis itu di-increment di memori buat tiap baris berikutnya di kelompok
 *  yang sama, ngikut urutan baris di file (yang notabene udah kronologis).
 *
 *  Baris yang teksnya ngandung "TXN" (biaya BI-FAST) gak dapet nomor urut baru — dia
 *  nempel ke No Bank baris NYATA terakhir buat rekening itu (bukan baris "TXN" lain),
 *  biar transaksi sama biaya-nya kebaca satu No Bank yang sama. */
export async function generateNoBankBatch(
  rows: { accountId: string; debet: number; kredit: number; tanggal: string; transaksi?: string | null }[]
): Promise<(string | null)[]> {
  const accountIds = [...new Set(rows.map(r => r.accountId))]
  const accs = accountIds.length ? await db.select().from(bankAccounts).where(inArray(bankAccounts.id, accountIds)) : []
  const accMap = new Map(accs.map(a => [a.id, a]))

  const prefixes = rows.map((r) => {
    const side = noBankSide(r.debet, r.kredit)
    const acc = accMap.get(r.accountId)
    const format = !acc || !side ? null : (side === 'debet' ? acc.noBankFormatDebet : acc.noBankFormatKredit)
    if (!side || !acc || !format) return null
    return { accountId: r.accountId, prefix: buildPrefix(format, r.tanggal) }
  })

  const groupKeys = [...new Set(prefixes.filter((p): p is { accountId: string; prefix: string } => !!p).map(p => `${p.accountId}\u0000${p.prefix}`))]
  const counters = new Map<string, { next: number; padWidth: number }>()
  for (const key of groupKeys) {
    const [accountId, prefix] = key.split('\u0000') as [string, string]
    counters.set(key, await maxSeqForPrefix(accountId, prefix))
  }

  const lastNoBank = new Map<string, string>() // accountId -> No Bank transaksi NYATA terakhir
  const result: (string | null)[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    if (isTxnFee(r.transaksi) && lastNoBank.has(r.accountId)) {
      result.push(lastNoBank.get(r.accountId)!)
      continue // jangan konsumsi nomor urut baru, jangan update lastNoBank -> biaya TXN
               // berantai (kalau ada) tetap nempel ke transaksi aslinya, bukan ke TXN sebelumnya
    }
    const p = prefixes[i]
    if (!p) { result.push(null); continue }
    const key = `${p.accountId}\u0000${p.prefix}`
    const counter = counters.get(key)!
    const noBank = `${p.prefix}${String(counter.next).padStart(counter.padWidth, '0')}`
    counter.next++
    lastNoBank.set(r.accountId, noBank)
    result.push(noBank)
  }
  return result
}

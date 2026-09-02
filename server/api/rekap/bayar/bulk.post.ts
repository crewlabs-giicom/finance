import { bayarRows } from '../../../database/schema'

/**
 * Import banyak baris Bayar sekaligus dari Excel. Body: { rows: [...] }, tiap
 * baris udah di-resolve client-side (nama Grup -> groupId, tanggal -> ISO).
 * Dedup di sini biar re-upload file yang sama gak bikin baris dobel — kunci
 * pembandingnya kombinasi groupId+nominal+tglBayar+noCtr.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const input = Array.isArray(body.rows) ? body.rows : null
  if (!input) throw createError({ statusCode: 400, statusMessage: 'Body harus berbentuk { rows: [...] }.' })
  if (!input.length) return { inserted: 0, duplikat: 0 }

  const existing = await db.select().from(bayarRows)
  const dupKey = (r: { groupId?: string | null; nominal?: number; tglBayar?: string | null; noCtr?: string | null }) =>
    `${r.groupId || ''}|${r.nominal || 0}|${r.tglBayar || ''}|${(r.noCtr || '').trim().toUpperCase()}`
  const seen = new Set(existing.map(r => dupKey(r as any)))

  const values: typeof bayarRows.$inferInsert[] = []
  let dup = 0
  for (const item of input) {
    const row = {
      groupId: item.groupId || null,
      nominal: Number(item.nominal) || 0,
      tglBayar: item.tglBayar || null,
      tglPesan: item.tglPesan || null,
      noCtr: String(item.noCtr || ''),
      payIam: String(item.payIam || ''),
      payEkspds: String(item.payEkspds || ''),
      ket: String(item.ket || '')
    }
    const key = dupKey(row)
    if (seen.has(key)) { dup++; continue }
    seen.add(key)
    values.push({ id: genId('byr'), ...row })
  }

  if (values.length) await db.insert(bayarRows).values(values)
  return { inserted: values.length, duplikat: dup }
})

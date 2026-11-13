import { isNull } from 'drizzle-orm'
import { cekUmpRows } from '../../database/schema'

/** Kunci dedup satu baris Cek UMP -- baris yang semua field ini sama persis
 *  dianggap data yang sama, gak boleh ke-import dobel. */
function dupKey(r: Record<string, any>) {
  return [r.tanggal, r.code, r.description, r.debet, r.kredit, r.coaId, r.store].join('|')
}

/**
 * Upload Excel Cek UMP: REPLACE semua baris yang BELUM match (matchNo null) dengan
 * isi file baru -- baris yang UDAH di-match TETAP DIPERTAHANKAN apa adanya, gak
 * boleh ketimpa/kehapus/dobel ("data yang sudah match gak boleh diotak-atik").
 * Baris baru yang persis sama kayak baris matched yang masih ada (atau sama kayak
 * baris baru lain dalam file yang sama) dilewatin, gak ikut di-import.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const input = Array.isArray(body.rows) ? body.rows : null
  if (!input) throw createError({ statusCode: 400, statusMessage: 'Body harus berbentuk { rows: [...] }.' })

  // REPLACE: baris lama yang belum match dibuang duluan -- baris yang udah match
  // gak kesentuh sama sekali.
  const removedRows = await db.delete(cekUmpRows).where(isNull(cekUmpRows.matchNo)).returning({ id: cekUmpRows.id })
  const removed = removedRows.length

  // Dedup terhadap SISA data (barusan dipertahankan, yang matched) + antar baris
  // baru dalam batch yang sama.
  const remaining = await db.select().from(cekUmpRows)
  const seen = new Set(remaining.map(dupKey))

  const lockYm = await getPeriodLockYm()
  const values: Record<string, unknown>[] = []
  let skipped = 0
  for (const item of input) {
    if (!item?.tanggal) { skipped++; continue }
    if (lockYm && String(item.tanggal).slice(0, 7) <= lockYm) { skipped++; continue }
    const key = dupKey(item)
    if (seen.has(key)) { skipped++; continue }
    seen.add(key)
    values.push({
      id: genId('ump'),
      tanggal: String(item.tanggal),
      transaksi: String(item.transaksi ?? ''),
      code: String(item.code ?? ''),
      description: String(item.description ?? ''),
      coaId: item.coaId || null,
      debet: Number(item.debet) || 0,
      kredit: Number(item.kredit) || 0,
      pt: String(item.pt ?? ''),
      store: String(item.store ?? ''),
      groupId: item.groupId || null,
      picId: item.picId || null,
      tag: String(item.tag ?? ''),
      matchNo: null,
      keterangan: '' // bukan dari Excel -- murni diisi manual belakangan di UI
    })
  }

  // Dipotong per 500 baris supaya jumlah bound parameter tetap jauh di bawah
  // SQLITE_MAX_VARIABLE_NUMBER (32766 di build better-sqlite3).
  for (let i = 0; i < values.length; i += 500) {
    await db.insert(cekUmpRows).values(values.slice(i, i + 500) as any)
  }
  return { inserted: values.length, skipped, removed }
})

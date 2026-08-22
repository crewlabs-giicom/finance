import { asetDepresiasiLog, asetRows } from '../../database/schema'

/**
 * Jalankan depresiasi satu periode untuk semua aset sekaligus.
 * Aturannya diport apa adanya dari jalankanDepresiasiAset() di app HTML lama:
 * satu aset dapat satu entri log per periode, berhenti kalau jumlah log sudah
 * menyamai umur ekonomis, dan aset yang belum mulai dipakai dilewati.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const periode = String(body.periode || '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periode)) {
    throw createError({ statusCode: 400, statusMessage: 'Periode harus format YYYY-MM, misal 2026-08.' })
  }

  const rows = await db.select().from(asetRows)
  const logs = await db.select().from(asetDepresiasiLog)

  const countByAset = new Map<string, number>()
  const periodeByAset = new Map<string, Set<string>>()
  for (const l of logs) {
    countByAset.set(l.asetId, (countByAset.get(l.asetId) || 0) + 1)
    if (!periodeByAset.has(l.asetId)) periodeByAset.set(l.asetId, new Set())
    periodeByAset.get(l.asetId)!.add(l.periode)
  }

  const today = new Date()
  const tanggal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const baru: typeof asetDepresiasiLog.$inferInsert[] = []
  let sudah = 0, habis = 0, belumMulai = 0

  for (const r of rows) {
    if (!r.tglMulai || !r.umurEkonomis) continue
    if (r.tglMulai.slice(0, 7) > periode) { belumMulai++; continue }
    if ((countByAset.get(r.id) || 0) >= r.umurEkonomis) { habis++; continue }
    if (periodeByAset.get(r.id)?.has(periode)) { sudah++; continue }
    baru.push({ id: genId('adl'), asetId: r.id, periode, tanggal })
  }

  if (baru.length) await db.insert(asetDepresiasiLog).values(baru)

  return { periode, didepresiasi: baru.length, sudah, habis, belumMulai }
})

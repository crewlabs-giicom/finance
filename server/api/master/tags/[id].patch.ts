import { eq } from 'drizzle-orm'
import { tagMaster, bankTxns, ppnRows, avpRows } from '../../../database/schema'
import { parseTagList, PAJAK_TAGS, ENT_TAG } from '../../../utils/tagSync'

/** Tag "spesial" yang dipakai logic otomatis (lihat tagSync.ts) gak boleh di-rename dari sini —
 *  PAJAK_TAGS/ENT_TAG di-hardcode di server, kalau namanya berubah di sini doang, perhitungan
 *  pajak/Entertainment otomatis di Rincian Bank langsung berhenti nyambung. */
const LOCKED_TAGS = new Set<string>([...PAJAK_TAGS, ENT_TAG])

/** Tag biasa (bukan yang di-hardcode) masih kepake bebas di transaksi lama lewat nama literal —
 *  jadi begitu nama tag-nya diubah di master, semua baris yang masih pakai nama lama ikut
 *  diganti, biar histori gak putus nyambungnya ke tag yang baru. */
async function renameInColumn(table: any, column: string, oldName: string, newName: string) {
  const rows: Record<string, any>[] = await db.select().from(table)
  for (const row of rows) {
    const list = parseTagList(row[column])
    const idx = list.indexOf(oldName)
    if (idx === -1) continue
    list[idx] = newName
    await db.update(table).set({ [column]: list.join(',') }).where(eq(table.id, row.id))
  }
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const nama = String(body?.nama || '').trim()
  if (!nama) throw createError({ statusCode: 400, statusMessage: 'Nama tag wajib diisi.' })

  const [existing] = await db.select().from(tagMaster).where(eq(tagMaster.id, id)).limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Tag gak ketemu.' })
  if (nama === existing.nama) return { ok: true }

  if (LOCKED_TAGS.has(existing.nama)) {
    throw createError({ statusCode: 400, statusMessage: `Tag "${existing.nama}" dipakai logic hitung otomatis sistem (List Pajak/Entertainment) — gak bisa diganti nama dari sini.` })
  }

  try {
    await db.update(tagMaster).set({ nama }).where(eq(tagMaster.id, id))
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Nama tag ini udah dipakai.' })
  }

  await renameInColumn(bankTxns, 'tag', existing.nama, nama)
  await renameInColumn(ppnRows, 'tags', existing.nama, nama)
  await renameInColumn(avpRows, 'tags', existing.nama, nama)

  return { ok: true }
})

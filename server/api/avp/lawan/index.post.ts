import { and, eq, inArray } from 'drizzle-orm'
import { avpLawan, avpRows } from '../../../database/schema'

/** Nilai baris = sisi yang terisi — dipakai buat cek kapasitas lawan. */
function rowAmount(row: { debet: number; kredit: number }) {
  return row.debet > 0 ? row.debet : row.kredit
}

/**
 * Pasangkan dua baris Aktiva-Pasiva. Relasinya dua arah: kalau A lawan B,
 * maka B juga lawan A — jadi disimpan sebagai dua baris supaya query dari
 * sisi mana pun sama gampangnya.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const rowId = String(body.rowId || '')
  const partnerId = String(body.partnerId || '')

  if (!rowId || !partnerId) throw createError({ statusCode: 400, statusMessage: 'rowId dan partnerId wajib diisi.' })
  if (rowId === partnerId) throw createError({ statusCode: 400, statusMessage: 'Baris tidak bisa jadi lawan dirinya sendiri.' })

  const found = await db.select().from(avpRows).where(inArray(avpRows.id, [rowId, partnerId]))
  if (found.length !== 2) throw createError({ statusCode: 404, statusMessage: 'Salah satu baris gak ketemu.' })
  const owner = found.find(r => r.id === rowId)!
  const partner = found.find(r => r.id === partnerId)!

  const [dupe] = await db.select().from(avpLawan)
    .where(and(eq(avpLawan.rowId, rowId), eq(avpLawan.partnerId, partnerId))).limit(1)
  if (dupe) return { ok: true, already: true }

  // Total lawan yang dipasangkan ke baris ini gak boleh melebihi nilai baris itu sendiri
  // (mis. debet 1 juta cuma bisa dipakai 1 juta buat lawannya, gak bisa lebih).
  const existingPartnerIds = (await db.select({ partnerId: avpLawan.partnerId }).from(avpLawan).where(eq(avpLawan.rowId, rowId)))
    .map(x => x.partnerId)
  const existingPartnerRows = existingPartnerIds.length
    ? await db.select().from(avpRows).where(inArray(avpRows.id, existingPartnerIds))
    : []
  const currentMatched = existingPartnerRows.reduce((a, p) => a + rowAmount(p), 0)
  const ownerAmount = rowAmount(owner)
  if (currentMatched + rowAmount(partner) > ownerAmount + 0.5) {
    throw createError({
      statusCode: 400,
      statusMessage: `Total lawan gak boleh lebih dari nilai barisnya (Rp ${ownerAmount.toLocaleString('id-ID')}). Sudah terpakai Rp ${currentMatched.toLocaleString('id-ID')}.`
    })
  }

  await db.insert(avpLawan).values([
    { id: genId('avpl'), rowId, partnerId },
    { id: genId('avpl'), rowId: partnerId, partnerId: rowId }
  ])
  return { ok: true }
})

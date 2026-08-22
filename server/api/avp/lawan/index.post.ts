import { and, eq, inArray } from 'drizzle-orm'
import { avpLawan, avpRows } from '../../../database/schema'

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

  const found = await db.select({ id: avpRows.id }).from(avpRows).where(inArray(avpRows.id, [rowId, partnerId]))
  if (found.length !== 2) throw createError({ statusCode: 404, statusMessage: 'Salah satu baris gak ketemu.' })

  const [dupe] = await db.select().from(avpLawan)
    .where(and(eq(avpLawan.rowId, rowId), eq(avpLawan.partnerId, partnerId))).limit(1)
  if (dupe) return { ok: true, already: true }

  await db.insert(avpLawan).values([
    { id: genId('avpl'), rowId, partnerId },
    { id: genId('avpl'), rowId: partnerId, partnerId: rowId }
  ])
  return { ok: true }
})

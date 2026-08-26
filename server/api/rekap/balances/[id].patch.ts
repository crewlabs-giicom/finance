import { eq } from 'drizzle-orm'
import { bankBalances } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const patch: Record<string, any> = {}
  if (body.saldo !== undefined) {
    const [row] = await db.select({ locked: bankBalances.locked }).from(bankBalances).where(eq(bankBalances.id, id)).limit(1)
    if (row?.locked) {
      throw createError({ statusCode: 423, statusMessage: 'Baris ini lagi digembok. Buka gembok dulu buat ngedit Saldo-nya.' })
    }
    patch.saldo = Number(body.saldo) || 0
    // "Bisa Dipakai" itu rumus turunan dari saldo, bukan input manual — selalu dihitung ulang.
    patch.bisaDipakai = hitungBisaDipakai(patch.saldo)
  }
  if (body.pic !== undefined) patch.pic = body.pic || null
  if (body.rek !== undefined) patch.rek = String(body.rek)
  if (body.ket !== undefined) patch.ket = String(body.ket)
  if (body.grup !== undefined) patch.grup = body.grup || null
  if (body.locked !== undefined) patch.locked = !!body.locked
  if (Object.keys(patch).length === 0) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })
  await db.update(bankBalances).set(patch).where(eq(bankBalances.id, id))
  return { ok: true }
})

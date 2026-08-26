import { eq } from 'drizzle-orm'
import { bankBalances } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const patch: Record<string, any> = {}
  if (body.saldo !== undefined) patch.saldo = Number(body.saldo) || 0
  if (body.pic !== undefined) patch.pic = String(body.pic)
  if (body.rek !== undefined) patch.rek = String(body.rek)
  if (body.bisaDipakai !== undefined) patch.bisaDipakai = body.bisaDipakai === '' || body.bisaDipakai === null ? null : Number(body.bisaDipakai)
  if (body.ket !== undefined) patch.ket = String(body.ket)
  if (body.grup !== undefined) patch.grup = body.grup || null
  if (Object.keys(patch).length === 0) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })
  await db.update(bankBalances).set(patch).where(eq(bankBalances.id, id))
  return { ok: true }
})

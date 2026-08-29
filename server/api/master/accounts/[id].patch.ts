import { eq } from 'drizzle-orm'
import { bankAccounts } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const patch: Record<string, any> = {}
  if (body.saldoAwal !== undefined) patch.saldoAwal = body.saldoAwal === '' || body.saldoAwal === null ? null : (Number(body.saldoAwal) || 0)
  if (body.namaRek !== undefined) patch.namaRek = String(body.namaRek)
  if (body.noRek !== undefined) patch.noRek = String(body.noRek)
  if (body.bankType !== undefined) patch.bankType = String(body.bankType)
  if (body.groupId !== undefined) patch.groupId = body.groupId || null
  if (body.picId !== undefined) patch.picId = body.picId || null
  if (body.noBankFormatDebet !== undefined) patch.noBankFormatDebet = String(body.noBankFormatDebet).trim() || null
  if (body.noBankFormatKredit !== undefined) patch.noBankFormatKredit = String(body.noBankFormatKredit).trim() || null
  if (Object.keys(patch).length === 0) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })
  await db.update(bankAccounts).set(patch).where(eq(bankAccounts.id, id))
  return { ok: true }
})

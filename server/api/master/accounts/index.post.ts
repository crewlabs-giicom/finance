import { bankAccounts } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const namaRek = String(body?.namaRek || '').trim()
  const noRek = String(body?.noRek || '').trim()
  const bankType = String(body?.bankType || 'BCA').trim()
  const groupId = body?.groupId || null
  const picId = body?.picId || null
  const saldoAwal = body?.saldoAwal === '' || body?.saldoAwal === null || body?.saldoAwal === undefined ? null : (Number(body.saldoAwal) || 0)
  if (!namaRek || !noRek) throw createError({ statusCode: 400, statusMessage: 'Nama rekening dan No. Rekening wajib diisi.' })
  const id = genId('acc')
  await db.insert(bankAccounts).values({ id, namaRek, noRek, bankType, groupId, picId, saldoAwal })
  return { id, namaRek, noRek, bankType, groupId, picId, saldoAwal }
})

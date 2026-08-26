import { bankBalances } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.rek) throw createError({ statusCode: 400, statusMessage: 'Rek wajib diisi.' })

  const id = genId('bb')
  const row = {
    id,
    pic: body.pic || '',
    rek: body.rek,
    saldo: Number(body.saldo) || 0,
    bisaDipakai: body.bisaDipakai !== undefined && body.bisaDipakai !== null && body.bisaDipakai !== ''
      ? Number(body.bisaDipakai)
      : null,
    ket: body.ket || '',
    grup: body.grup || null
  }
  await db.insert(bankBalances).values(row)
  return row
})

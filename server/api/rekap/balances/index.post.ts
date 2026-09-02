import { bankBalances } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}

  const id = genId('bb')
  const saldo = Number(body.saldo) || 0
  const row = {
    id,
    pic: body.pic || null,
    rek: body.rek || '',
    saldo,
    bisaDipakai: hitungBisaDipakai(saldo),
    ket: body.ket || '',
    grup: body.grup || null
  }
  await db.insert(bankBalances).values(row)
  return row
})

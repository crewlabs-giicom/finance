import { depositoRows } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null) || {}
  const id = genId('dep')
  const row = { id, nama: '', nominal: 0, tglMasuk: null, rate: '', jatuhTempo: null, ket: '', groupId: body.groupId || null }
  await db.insert(depositoRows).values(row)
  return row
})

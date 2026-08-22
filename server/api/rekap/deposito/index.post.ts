import { depositoRows } from '../../../database/schema'

export default defineEventHandler(async () => {
  const id = genId('dep')
  const row = { id, nama: '', nominal: 0, tglMasuk: null, rate: '', jatuhTempo: null, ket: '' }
  await db.insert(depositoRows).values(row)
  return row
})

import { hutangRows } from '../../../database/schema'

export default defineEventHandler(async () => {
  const id = genId('hut')
  const row = { id, peminjam: '', kreditur: '', nominal: 0, rate: '', tglPinjam: null, jatuhTempo: null, ket: '' }
  await db.insert(hutangRows).values(row)
  return row
})

import { hutangRows } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null) || {}
  const id = genId('hut')
  const row = { id, peminjam: '', kreditur: '', nominal: 0, rate: '', tglPinjam: null, jatuhTempo: null, ket: '', groupId: body.groupId || null }
  await db.insert(hutangRows).values(row)
  return row
})

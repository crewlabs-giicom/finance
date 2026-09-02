import { bayarRows } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null) || {}
  const id = genId('byr')
  const row = { id, pt: '', groupId: body.groupId || null, nominal: 0, tglBayar: null, tglPesan: null, noCtr: '', payIam: '', payEkspds: '', ket: '' }
  await db.insert(bayarRows).values(row)
  return row
})

import { bayarRows } from '../../../database/schema'

export default defineEventHandler(async () => {
  const id = genId('byr')
  const row = { id, pt: '', nominal: 0, tglBayar: null, tglPesan: null, noCtr: '', payIam: '', payEkspds: '', ket: '' }
  await db.insert(bayarRows).values(row)
  return row
})

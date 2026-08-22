import { bankGroups } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const nama = String(body?.nama || '').trim()
  if (!nama) throw createError({ statusCode: 400, statusMessage: 'Nama grup wajib diisi.' })
  const warna = body?.warna || '#6C5CE7'
  const id = genId('grp')
  await db.insert(bankGroups).values({ id, nama, warna })
  return { id, nama, warna }
})

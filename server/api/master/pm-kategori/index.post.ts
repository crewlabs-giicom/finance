import { pmKategoriMaster } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const nama = String(body?.nama || '').trim()
  if (!nama) throw createError({ statusCode: 400, statusMessage: 'Nama kategori wajib diisi.' })
  const id = genId('pmkat')
  try {
    await db.insert(pmKategoriMaster).values({ id, nama })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Kategori ini udah ada.' })
  }
  return { id, nama }
})

import { tagMaster } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const nama = String(body?.nama || '').trim()
  if (!nama) throw createError({ statusCode: 400, statusMessage: 'Nama tag wajib diisi.' })
  const id = genId('tag')
  try {
    await db.insert(tagMaster).values({ id, nama })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Tag ini udah ada.' })
  }
  return { id, nama }
})

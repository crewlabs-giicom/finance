import { sql } from 'drizzle-orm'
import { pics } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const nama = String(body?.nama || '').trim()
  if (!nama) throw createError({ statusCode: 400, statusMessage: 'Nama PIC wajib diisi.' })
  const id = genId('pic')
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${pics.urutan}), -1) + 1` }).from(pics)
  await db.insert(pics).values({ id, nama, urutan: next })
  return { id, nama, urutan: next }
})

import { sql } from 'drizzle-orm'
import { bankGroups } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const nama = String(body?.nama || '').trim()
  if (!nama) throw createError({ statusCode: 400, statusMessage: 'Nama grup wajib diisi.' })
  const warna = body?.warna || '#6C5CE7'
  const id = genId('grp')
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${bankGroups.urutan}), -1) + 1` }).from(bankGroups)
  await db.insert(bankGroups).values({ id, nama, warna, urutan: next })
  return { id, nama, warna, urutan: next }
})

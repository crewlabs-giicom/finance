import { eq } from 'drizzle-orm'
import { bankGroups } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event) || {}

  const patch: Record<string, unknown> = {}
  if (body.nama !== undefined) {
    const nama = String(body.nama).trim()
    if (!nama) throw createError({ statusCode: 400, statusMessage: 'Nama grup wajib diisi.' })
    patch.nama = nama
  }
  if (body.warna !== undefined) patch.warna = String(body.warna)
  if (body.urutan !== undefined) patch.urutan = Number(body.urutan) || 0
  if (!Object.keys(patch).length) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })

  await db.update(bankGroups).set(patch).where(eq(bankGroups.id, id))
  return { ok: true }
})

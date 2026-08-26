import { eq } from 'drizzle-orm'
import { pics } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event) || {}

  const patch: Record<string, unknown> = {}
  if (body.nama !== undefined) {
    const nama = String(body.nama).trim()
    if (!nama) throw createError({ statusCode: 400, statusMessage: 'Nama PIC wajib diisi.' })
    patch.nama = nama
  }
  if (body.urutan !== undefined) patch.urutan = Number(body.urutan) || 0
  if (!Object.keys(patch).length) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })

  await db.update(pics).set(patch).where(eq(pics.id, id))
  return { ok: true }
})

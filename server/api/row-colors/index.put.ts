import { rowColors } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const entityKind = String(body?.entityKind || '')
  const entityId = String(body?.entityId || '')
  const color = String(body?.color || '')
  if (!entityKind || !entityId || !color) throw createError({ statusCode: 400, statusMessage: 'entityKind, entityId, color wajib diisi.' })

  await db.insert(rowColors)
    .values({ id: genId('rc'), entityKind, entityId, color })
    .onConflictDoUpdate({
      target: [rowColors.entityKind, rowColors.entityId],
      set: { color }
    })
  return { ok: true }
})

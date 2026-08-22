import { and, eq } from 'drizzle-orm'
import { rowColors } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const entityKind = String(query.entityKind || '')
  const entityId = String(query.entityId || '')
  if (!entityKind || !entityId) throw createError({ statusCode: 400, statusMessage: 'entityKind, entityId wajib diisi.' })
  await db.delete(rowColors).where(and(eq(rowColors.entityKind, entityKind), eq(rowColors.entityId, entityId)))
  return { ok: true }
})

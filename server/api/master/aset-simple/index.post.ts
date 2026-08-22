import { and, eq } from 'drizzle-orm'
import { asetSimpleMaster } from '../../../database/schema'

const KINDS = ['tipe', 'kategori', 'div']

export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const kind = String(body.kind || '')
  const value = String(body.value || '').trim()

  if (!KINDS.includes(kind)) throw createError({ statusCode: 400, statusMessage: `kind harus salah satu dari: ${KINDS.join(', ')}.` })
  if (!value) throw createError({ statusCode: 400, statusMessage: 'Nilai wajib diisi.' })

  const [dupe] = await db.select().from(asetSimpleMaster)
    .where(and(eq(asetSimpleMaster.kind, kind), eq(asetSimpleMaster.value, value))).limit(1)
  if (dupe) throw createError({ statusCode: 409, statusMessage: `"${value}" sudah ada di daftar ${kind}.` })

  const row = { id: genId('ast'), kind, value }
  await db.insert(asetSimpleMaster).values(row)
  return row
})

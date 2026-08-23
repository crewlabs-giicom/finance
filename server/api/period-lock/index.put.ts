import { periodLock } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const raw = body.lockYm

  // null / '' = buka kunci
  let lockYm: string | null = null
  if (raw !== null && raw !== undefined && raw !== '') {
    lockYm = String(raw)
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(lockYm)) {
      throw createError({ statusCode: 400, statusMessage: 'Format periode harus YYYY-MM, misal 2026-07.' })
    }
  }

  // Tabel ini cuma punya satu baris (id = 1).
  await db.insert(periodLock).values({ id: 1, lockYm })
    .onConflictDoUpdate({ target: periodLock.id, set: { lockYm } })

  return { lockYm }
})

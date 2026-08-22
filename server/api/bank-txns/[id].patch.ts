import { eq } from 'drizzle-orm'
import { bankTxns } from '../../database/schema'

const EDITABLE_FIELDS = ['transaksi', 'cabang', 'debet', 'kredit', 'tag', 'noBankManual', 'ketTransaksiManual', 'noteManual', 'checked', 'tanggal', 'saldo']

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const row = await db.select().from(bankTxns).where(eq(bankTxns.id, id)).get()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Transaksi gak ketemu.' })

  await assertNotLocked(row.tanggal)
  if (body.tanggal !== undefined) await assertNotLocked(String(body.tanggal))

  const patch: Record<string, any> = {}
  for (const f of EDITABLE_FIELDS) {
    if (body[f] !== undefined) {
      if (f === 'debet' || f === 'kredit' || f === 'saldo') patch[f] = Number(body[f]) || 0
      else if (f === 'checked') patch[f] = !!body[f]
      else patch[f] = String(body[f])
    }
  }
  if (Object.keys(patch).length === 0) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })

  await db.update(bankTxns).set(patch).where(eq(bankTxns.id, id))
  return { ok: true }
})

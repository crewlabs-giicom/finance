import { eq } from 'drizzle-orm'
import { bankTxns } from '../../database/schema'

const EDITABLE_FIELDS = ['transaksi', 'cabang', 'debet', 'kredit', 'tag', 'noBankManual', 'ketTransaksiManual', 'noteManual', 'checked', 'tanggal', 'saldo']

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const [row] = await db.select().from(bankTxns).where(eq(bankTxns.id, id)).limit(1)
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

  // Auto-generate No Bank kalau Debet/Kredit baru diisi dan No Bank masih kosong — gak nimpa
  // kalau user emang lagi ngisi No Bank manual bareng di request yang sama.
  if (('debet' in patch || 'kredit' in patch) && !('noBankManual' in patch) && !row.noBankManual) {
    const debet = patch.debet !== undefined ? patch.debet : row.debet
    const kredit = patch.kredit !== undefined ? patch.kredit : row.kredit
    const tanggal = patch.tanggal !== undefined ? patch.tanggal : row.tanggal
    const side = noBankSide(debet, kredit)
    if (side) {
      const autoNoBank = await generateNoBank(row.accountId, side, tanggal)
      if (autoNoBank) patch.noBankManual = autoNoBank
    }
  }

  await db.update(bankTxns).set(patch).where(eq(bankTxns.id, id))

  const SALDO_TRIGGER_FIELDS = ['debet', 'kredit', 'tanggal']
  if (SALDO_TRIGGER_FIELDS.some(f => f in patch)) {
    const fromTanggal = patch.tanggal !== undefined && patch.tanggal < row.tanggal ? patch.tanggal : row.tanggal
    await recomputeAccountSaldo(row.accountId, undefined, fromTanggal)
  }

  const SYNC_TRIGGER_FIELDS = ['tag', 'tanggal', 'debet', 'kredit', 'transaksi', 'ketTransaksiManual', 'noBankManual']
  if (SYNC_TRIGGER_FIELDS.some(f => f in patch)) await syncTagDerivedRows(id)

  return { ok: true }
})

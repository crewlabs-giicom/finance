import { eq } from 'drizzle-orm'
import { bankTxns, bankAccounts, ppnRows, entRows } from '../database/schema'

// Tag "PPH 23" / "PP 23" / "PPH 4" / "21 BP" / "Final" di Rincian Bank -> otomatis
// sinkron ke satu baris List Pajak. Tag "Ent" -> otomatis sinkron ke satu baris
// Entertainment. Ganti tag / edit nominal-tanggal-keterangan transaksi otomatis
// update baris terhubung (dilacak lewat sourceTxnId, gak pernah bikin baris dobel).
const PAJAK_TAGS = new Set(['PPH 23', 'PP 23', 'PPH 4', '21 BP', 'Final'])
const ENT_TAG = 'Ent'

function computeTagFormula(tag: string, debet: number) {
  const base = debet / 0.11
  if (tag === 'PPH 23') return { pph23: Math.round(base * 0.02), pph23_4a2: null, pph21bp: null }
  if (tag === 'PP 23') return { pph23: null, pph23_4a2: Math.round(base * 0.005), pph21bp: null }
  if (tag === 'PPH 4') return { pph23: null, pph23_4a2: Math.round(base * 0.10), pph21bp: null }
  if (tag === '21 BP') return { pph23: null, pph23_4a2: null, pph21bp: Math.round(base * 0.025) }
  return { pph23: null, pph23_4a2: null, pph21bp: null }
}

function hasManualPpnData(r: typeof ppnRows.$inferSelect) {
  return !!(r.npwpId || r.noInvoice || r.lampiranFakturPajak || r.masaKredit || r.bentukJenisBiaya)
}
function hasManualEntData(r: typeof entRows.$inferSelect) {
  return !!(r.place || r.alamat || r.jenis || r.clientName || r.posisi || r.company || r.jenisUsaha || r.note)
}

/** Baris yang udah keisi data manual gak pernah dihapus otomatis — cuma dilepas connect-nya. */
async function settlePpn(existing: typeof ppnRows.$inferSelect) {
  if (hasManualPpnData(existing)) await db.update(ppnRows).set({ sourceTxnId: null }).where(eq(ppnRows.id, existing.id))
  else await db.delete(ppnRows).where(eq(ppnRows.id, existing.id))
}
async function settleEnt(existing: typeof entRows.$inferSelect) {
  if (hasManualEntData(existing)) await db.update(entRows).set({ sourceTxnId: null }).where(eq(entRows.id, existing.id))
  else await db.delete(entRows).where(eq(entRows.id, existing.id))
}

/** Dipanggil tiap transaksi Rincian Bank diubah (tag, nominal, tanggal, keterangan, dst). */
export async function syncTagDerivedRows(txnId: string) {
  const [t] = await db.select().from(bankTxns).where(eq(bankTxns.id, txnId)).limit(1)
  if (!t) return

  const [acc] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, t.accountId)).limit(1)
  const groupId = acc?.groupId ?? null
  const desc = t.ketTransaksiManual || t.transaksi || ''
  const amount = t.debet || t.kredit || 0
  const isPajak = PAJAK_TAGS.has(t.tag || '')
  const isEnt = t.tag === ENT_TAG

  const [existingPpn] = await db.select().from(ppnRows).where(eq(ppnRows.sourceTxnId, txnId)).limit(1)
  if (isPajak) {
    const formula = computeTagFormula(t.tag || '', amount)
    if (existingPpn) {
      await db.update(ppnRows).set({
        tanggal: t.tanggal, description: desc, debet: amount, tags: t.tag || '', groupId, code: t.noBankManual || '', ...formula
      }).where(eq(ppnRows.id, existingPpn.id))
    } else {
      await db.insert(ppnRows).values({
        id: genId('ppn'), sourceTxnId: txnId, groupId, tanggal: t.tanggal, code: t.noBankManual || '',
        description: desc, store: '', tags: t.tag || '', debet: amount, kredit: 0, note: '', ...formula
      })
    }
  } else if (existingPpn) {
    await settlePpn(existingPpn)
  }

  const [existingEnt] = await db.select().from(entRows).where(eq(entRows.sourceTxnId, txnId)).limit(1)
  if (isEnt) {
    if (existingEnt) {
      await db.update(entRows).set({ tanggal: t.tanggal, description: desc, amount, groupId, note: t.noBankManual || '' }).where(eq(entRows.id, existingEnt.id))
    } else {
      await db.insert(entRows).values({ id: genId('ent'), sourceTxnId: txnId, groupId, tanggal: t.tanggal, description: desc, amount, note: t.noBankManual || '' })
    }
  } else if (existingEnt) {
    await settleEnt(existingEnt)
  }
}

/** Dipanggil sebelum transaksi Rincian Bank dihapus, biar baris List Pajak/Entertainment yang nyambung gak ikut error FK. */
export async function detachDerivedRows(txnId: string) {
  const [existingPpn] = await db.select().from(ppnRows).where(eq(ppnRows.sourceTxnId, txnId)).limit(1)
  if (existingPpn) await settlePpn(existingPpn)
  const [existingEnt] = await db.select().from(entRows).where(eq(entRows.sourceTxnId, txnId)).limit(1)
  if (existingEnt) await settleEnt(existingEnt)
}

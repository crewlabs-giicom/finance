import { eq } from 'drizzle-orm'
import { bankTxns, bankAccounts, ppnRows, entRows } from '../database/schema'

// Satu transaksi boleh punya lebih dari satu tag (disimpen comma-separated di kolom
// "tag", mis. "PPH 23,Ent"). Tag "PPH 23" / "PP 23" / "PPH 4" / "21 BP" / "Final" di
// Rincian Bank -> otomatis sinkron ke satu baris List Pajak. Tag "Ent" -> otomatis
// sinkron ke satu baris Entertainment — keduanya bisa aktif bareng buat transaksi yang
// sama. Ganti tag / edit nominal-tanggal-keterangan transaksi otomatis update baris
// terhubung (dilacak lewat sourceTxnId, gak pernah bikin baris dobel).
const PAJAK_TAGS = new Set(['PPH 23', 'PP 23', 'PPH 4', '21 BP', 'Final'])
const ENT_TAG = 'Ent'

export function parseTagList(raw: string | null | undefined): string[] {
  return (raw || '').split(',').map(s => s.trim()).filter(Boolean)
}

/** Beberapa tag pajak bisa aktif sekaligus — tiap tag ngisi kolom pajaknya sendiri, gak
 *  saling timpa. Semua tarif langsung dari nilai Debet (bukan dari DPP/Debet-dibagi-11%). */
function computeTagFormula(tags: string[], debet: number) {
  const d = debet || 0
  let pph23: number | null = null, pph23_4a2: number | null = null, pph21bp: number | null = null
  if (tags.includes('PPH 23')) pph23 = Math.round(d * 0.02)
  if (tags.includes('PP 23')) pph23_4a2 = Math.round(d * 0.005)
  if (tags.includes('Final') || tags.includes('PPH 4')) pph23_4a2 = Math.round(d * 0.10)
  if (tags.includes('21 BP')) pph21bp = Math.round(d * 0.025)
  return { pph23, pph23_4a2, pph21bp }
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
  const tagList = parseTagList(t.tag)
  const isPajak = tagList.some(tag => PAJAK_TAGS.has(tag))
  const isEnt = tagList.includes(ENT_TAG)

  const [existingPpn] = await db.select().from(ppnRows).where(eq(ppnRows.sourceTxnId, txnId)).limit(1)
  if (isPajak) {
    const formula = computeTagFormula(tagList, amount)
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

import { asc, gt, sql } from 'drizzle-orm'
import { ppnRows } from '../database/schema'

/** Urutan buat baris BARU (tambah manual / auto-sync dari Rincian Bank) — selalu
 *  paling besar se-tabel, jadi nongol di paling bawah (perilaku sekarang). */
export async function nextPpnUrutan(): Promise<number> {
  const [row] = await db.select({ max: sql<number>`coalesce(max(${ppnRows.urutan}), 0)` }).from(ppnRows)
  return (row?.max || 0) + 1
}

/** Urutan buat hasil Duplicate — disisipin PERSIS di bawah baris sumber: cari baris
 *  berikutnya (urutan lebih besar dari sumber) di SELURUH tabel (List Pajak/List PM
 *  cuma nge-filter baris yang udah keurut, gak ada sort tambahan), ambil titik tengah;
 *  kalau sumbernya udah paling akhir, +1 aja. */
export async function ppnUrutanAfter(sourceUrutan: number): Promise<number> {
  const [next] = await db.select().from(ppnRows)
    .where(gt(ppnRows.urutan, sourceUrutan))
    .orderBy(asc(ppnRows.urutan))
    .limit(1)
  return next?.urutan != null ? (sourceUrutan + next.urutan) / 2 : sourceUrutan + 1
}

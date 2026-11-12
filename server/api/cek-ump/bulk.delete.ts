import { isNull } from 'drizzle-orm'
import { cekUmpRows } from '../../database/schema'

/** "Hapus Semua" cuma hapus baris yang BELUM match -- baris yang udah di-match
 *  gak boleh keikut kehapus ("data yang sudah match gak boleh diotak-atik"). */
export default defineEventHandler(async () => {
  await db.delete(cekUmpRows).where(isNull(cekUmpRows.matchNo))
  return { ok: true }
})

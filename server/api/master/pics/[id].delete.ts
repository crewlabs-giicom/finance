import { eq } from 'drizzle-orm'
import { pics, bankBalances, users } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  // Baris yang masih ikut PIC ini jadi "Tanpa PIC", user yang link ke PIC ini dilepas — bukan ikut kehapus.
  await db.update(bankBalances).set({ pic: null }).where(eq(bankBalances.pic, id))
  await db.update(users).set({ picId: null }).where(eq(users.picId, id))
  await db.delete(pics).where(eq(pics.id, id))
  return { ok: true }
})

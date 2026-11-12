export type Pic = { id: string; nama: string; urutan: number }

/**
 * Master PIC — dipakai buat kolom & filter PIC di Rekap Saldo, dan link ke user login.
 * Disimpan di useState supaya satu kali fetch cukup untuk seluruh sesi navigasi.
 */
export function usePics() {
  const api = useApi()
  const pics = useState<Pic[]>('pics', () => [])

  async function load(force = false) {
    if (pics.value.length && !force) return pics.value
    pics.value = await api<Pic[]>('/api/master/pics')
    return pics.value
  }

  function nameOf(id: string | null | undefined) {
    return pics.value.find(p => p.id === id)?.nama || 'Tanpa PIC'
  }

  /** PIC user yang lagi login (null kalau gak punya PIC) — dipakai buat preset filter PIC
   *  otomatis ke dirinya sendiri waktu dia login, mirror myGroupId() di useGroups.ts. */
  async function myPicId(): Promise<string | null> {
    try {
      const me = await api<{ picId: string | null }>('/api/auth/me')
      return me.picId || null
    } catch {
      return null
    }
  }

  return { pics, load, nameOf, myPicId }
}

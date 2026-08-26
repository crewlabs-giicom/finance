export type Group = { id: string; nama: string; warna: string | null; picId: string | null }

/**
 * Grup PT/rekening dipakai hampir semua modul untuk mengelompokkan tabel.
 * Disimpan di useState supaya satu kali fetch cukup untuk seluruh sesi navigasi.
 */
export function useGroups() {
  const api = useApi()
  const groups = useState<Group[]>('groups', () => [])

  async function load(force = false) {
    if (groups.value.length && !force) return groups.value
    groups.value = await api<Group[]>('/api/master/groups')
    return groups.value
  }

  function nameOf(id: string | null | undefined) {
    return groups.value.find(g => g.id === id)?.nama || 'Tanpa Grup'
  }
  function colorOf(id: string | null | undefined) {
    return groups.value.find(g => g.id === id)?.warna || '#E4E4E4'
  }

  /** Grup + satu bucket "Tanpa Grup" di akhir — urutan section yang dipakai semua modul. */
  const sections = computed(() => [
    ...groups.value.map(g => ({ id: g.id as string | null, nama: g.nama, warna: g.warna || '#E4E4E4' })),
    { id: null as string | null, nama: 'Tanpa Grup', warna: '#E4E4E4' }
  ])

  /**
   * Grup yang PIC-nya sama dengan PIC user yang lagi login — dipakai buat preset
   * "Filter Grup" tiap modul otomatis ke grup dia sendiri. null kalau user gak punya
   * PIC, atau gak ada grup yang di-set ke PIC itu.
   */
  async function myGroupId(): Promise<string | null> {
    try {
      const me = await api<{ picId: string | null }>('/api/auth/me')
      if (!me.picId) return null
      return groups.value.find(g => g.picId === me.picId)?.id ?? null
    } catch {
      return null
    }
  }

  return { groups, load, nameOf, colorOf, sections, myGroupId }
}

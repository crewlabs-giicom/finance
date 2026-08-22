import { MONTH_NAMES } from '~/utils/format'

/**
 * Kunci periode: semua data yang tanggalnya di bulan terkunci ke bawah tidak
 * boleh ditambah/diubah/dihapus. Server yang menegakkan aturannya
 * (server/utils/periodLock.ts); composable ini untuk menampilkan status dan
 * mencegah user membuang waktu mengisi form yang pasti ditolak.
 */
export function usePeriodLock() {
  const api = useApi()
  const lockYm = useState<string | null>('period-lock', () => null)

  async function refresh() {
    const res = await api<{ lockYm: string | null }>('/api/period-lock')
    lockYm.value = res.lockYm
  }

  async function setLock(ym: string | null) {
    const res = await api<{ lockYm: string | null }>('/api/period-lock', { method: 'PUT', body: { lockYm: ym } })
    lockYm.value = res.lockYm
  }

  const label = computed(() => {
    if (!lockYm.value) return 'Belum ada periode yang dikunci'
    const [y, m] = lockYm.value.split('-')
    return `${MONTH_NAMES[+m! - 1]} ${y}`
  })

  /** true kalau tanggal ini jatuh di periode terkunci. */
  function isLocked(iso: string | null | undefined) {
    if (!iso || !lockYm.value) return false
    return iso.slice(0, 7) <= lockYm.value
  }

  return { lockYm, label, refresh, setLock, isLocked }
}

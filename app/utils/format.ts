// Helper format yang dipakai di semua modul.
// Diport apa adanya dari aplikasi HTML lama supaya angka & tanggal tampil persis sama.

export function fmtRp(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '-'
  const sign = n < 0 ? '-' : ''
  return sign + 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID')
}

/** Angka tanpa prefix "Rp", buat kolom tabel yang sudah jelas satuannya. */
export function fmtNum(n: number | null | undefined, zeroAsBlank = false): string {
  if (n === null || n === undefined || isNaN(n)) return ''
  if (zeroAsBlank && n === 0) return ''
  return Math.round(n).toLocaleString('id-ID')
}

/** Terima input user gaya Indonesia ("1.234.567,89") maupun angka polos. */
export function parseNum(str: unknown): number {
  const cleaned = String(str).replace(/[^0-9,.\-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

export function fmtTgl(iso: string | null | undefined): string {
  if (!iso) return 'belum ditentukan'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ISO 'YYYY-MM-DD' -> 'DD/MM/YY' untuk tampilan sel tabel. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const parts = iso.split('-')
  if (parts.length !== 3) return ''
  const [y, m, d] = parts
  return `${d}/${m}/${y!.slice(2)}`
}

/** Kebalikan formatDateShort — menerima 'D/M/YY', 'DD-MM-YYYY', dst. null kalau tidak valid. */
export function parseDateShort(str: string): string | null {
  const m = str.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!m) return null
  let [, d, mo, y] = m as unknown as [string, string, string, string]
  if (y.length === 2) y = (parseInt(y, 10) < 70 ? '20' : '19') + y
  d = d.padStart(2, '0')
  mo = mo.padStart(2, '0')
  if (+d < 1 || +d > 31 || +mo < 1 || +mo > 12) return null
  return `${y}-${mo}-${d}`
}

/** Satu transaksi Rincian Bank boleh punya beberapa tag, disimpen comma-separated. */
export function parseTagList(raw: string | null | undefined): string[] {
  return (raw || '').split(',').map(s => s.trim()).filter(Boolean)
}

// Rumus "Bisa Dipakai" (Rekap Saldo): IF(saldo>12000000, MROUND(saldo,1000000)-12000000, 0)
// Cermin dari server/utils/bisaDipakai.ts — dipakai buat update tampilan lokal secara instan
// sebelum data dari server diambil ulang.
export function hitungBisaDipakai(saldo: number): number {
  if (!(saldo > 12_000_000)) return 0
  return Math.round(saldo / 1_000_000) * 1_000_000 - 12_000_000
}

/** Textarea sel tabel yang tumbuh otomatis sesuai isinya, biar teks panjang kelihatan tanpa terpotong. */
export function autoGrow(el: HTMLTextAreaElement | EventTarget | null) {
  const ta = el as HTMLTextAreaElement | null
  if (!ta) return
  ta.style.height = 'auto'
  ta.style.height = ta.scrollHeight + 'px'
}

export function sumBy<T>(arr: T[], key: keyof T): number {
  return arr.reduce((a, x) => a + (Number(x[key]) || 0), 0)
}

export const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** 'YYYY-MM' dari ISO date, dipakai buat filter periode & cek kunci periode. */
export function ymOf(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 7) : ''
}

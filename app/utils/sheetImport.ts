/**
 * Helper import sheet Excel: cari baris header lalu petakan nama kolom ke field.
 * Diport dari *DetectHeaderMap / *FindHeaderRow di app HTML lama, yang polanya
 * diulang di modul PPn, Aktiva-Pasiva, Tagihan Ekspedisi, dan Aset.
 */

export type HeaderAliases = Record<string, string[]>

function norm(v: unknown) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
}

/** Petakan satu baris jadi { field: indexKolom }. Alias dicocokkan longgar (mengandung / dikandung). */
export function detectHeaderMap(row: unknown[], aliases: HeaderAliases): Record<string, number> {
  const map: Record<string, number> = {}
  row.forEach((cell, i) => {
    const h = norm(cell)
    if (!h) return
    for (const [field, names] of Object.entries(aliases)) {
      if (map[field] !== undefined) continue
      if (names.some(n => h === n || h.includes(n) || n.includes(h))) map[field] = i
    }
  })
  return map
}

/**
 * Cari baris header di 20 baris pertama. Baris dianggap header kalau berhasil
 * memetakan minimal `minFields` kolom — export dari sistem lain sering punya
 * beberapa baris judul di atas tabel sebenarnya.
 */
export function findHeaderRow(rows: unknown[][], aliases: HeaderAliases, minFields = 2) {
  const limit = Math.min(rows.length, 20)
  for (let i = 0; i < limit; i++) {
    const map = detectHeaderMap(rows[i] || [], aliases)
    if (Object.keys(map).length >= minFields) return { index: i, map }
  }
  return null
}

/** Angka gaya Indonesia maupun angka asli dari sel Excel. */
export function parseSheetNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return val
  const s = String(val).replace(/[^\d,.\-]/g, '')
  // "1.234.567,89" -> titik ribuan; "1,234,567.89" -> koma ribuan
  const normalized = s.lastIndexOf(',') > s.lastIndexOf('.')
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(/,/g, '')
  const n = parseFloat(normalized)
  return isNaN(n) ? 0 : n
}

/** Tanggal dari sel Excel: Date asli, serial number Excel, atau berbagai format teks. */
export function parseSheetDate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  if (val instanceof Date && !isNaN(val.getTime())) return iso(val)

  if (typeof val === 'number') {
    // Serial date Excel: hari sejak 1899-12-30.
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : iso(new Date(d.getTime() + d.getTimezoneOffset() * 60000))
  }

  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (dmy) {
    let [, d, m, y] = dmy as unknown as [string, string, string, string]
    if (y.length === 2) y = (parseInt(y, 10) < 70 ? '20' : '19') + y
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(s)
  return isNaN(parsed.getTime()) ? null : iso(parsed)
}

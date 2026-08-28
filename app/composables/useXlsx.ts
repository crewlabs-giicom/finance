import { findHeaderRow, type HeaderAliases } from '~/utils/sheetImport'

/**
 * Import & export Excel. SheetJS di-load dinamis dan hanya di browser —
 * library-nya besar dan tidak ada gunanya masuk bundle SSR.
 */
export function useXlsx() {
  async function lib() {
    if (import.meta.server) throw new Error('Fitur Excel cuma jalan di browser.')
    return await import('xlsx')
  }

  /**
   * Baca file upload jadi array-of-arrays (baris mentah, tanpa asumsi header).
   *
   * File Excel kadang punya banyak sheet (mis. tab per bulan/rekening), dan sheet
   * yang lagi aktif waktu file disimpan belum tentu sheet PERTAMA di workbook-nya —
   * jadi kalau `aliases` dikasih, tiap sheet dicoba satu-satu sampai ketemu yang
   * baris headernya cocok, bukan langsung asumsi sheet pertama. Kalau gak ada alias
   * dikasih (atau gak ada sheet yang cocok), balik ke sheet pertama seperti biasa.
   */
  async function readFileRows(file: File, aliases?: HeaderAliases, minFields = 2): Promise<unknown[][]> {
    const XLSX = await lib()
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    if (!wb.SheetNames.length) return []

    if (aliases) {
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name]
        if (!sheet) continue
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][]
        if (findHeaderRow(rows, aliases, minFields)) return rows
      }
    }

    const sheet = wb.Sheets[wb.SheetNames[0]!]
    if (!sheet) return []
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][]
  }

  /** Export satu tabel HTML ke .xlsx. Kolom aksi (kelas .no-export) dibuang dulu. */
  async function exportTable(table: HTMLTableElement, filenamePrefix: string, sheetName = 'Sheet1') {
    const XLSX = await lib()
    const clone = table.cloneNode(true) as HTMLTableElement
    clone.querySelectorAll('.no-export').forEach(el => el.remove())
    // Input/select tidak terbaca sheet_to_json — nilainya ditulis balik jadi teks.
    clone.querySelectorAll('input, select, textarea').forEach((el) => {
      const v = el instanceof HTMLSelectElement
        ? (el.selectedOptions[0]?.textContent || '')
        : (el as HTMLInputElement).value
      el.replaceWith(document.createTextNode(v))
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.table_to_sheet(clone), sheetName.slice(0, 31))
    XLSX.writeFile(wb, `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  /** Export beberapa tabel sekaligus, satu sheet per tabel. */
  async function exportTables(items: { table: HTMLTableElement; sheetName: string }[], filenamePrefix: string) {
    const XLSX = await lib()
    const wb = XLSX.utils.book_new()
    const used = new Set<string>()
    for (const { table, sheetName } of items) {
      const clone = table.cloneNode(true) as HTMLTableElement
      clone.querySelectorAll('.no-export').forEach(el => el.remove())
      clone.querySelectorAll('input, select, textarea').forEach((el) => {
        const v = el instanceof HTMLSelectElement
          ? (el.selectedOptions[0]?.textContent || '')
          : (el as HTMLInputElement).value
        el.replaceWith(document.createTextNode(v))
      })
      // Nama sheet Excel maksimal 31 karakter dan harus unik.
      let name = sheetName.replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'Sheet'
      let n = 2
      while (used.has(name)) name = `${name.slice(0, 28)}-${n++}`
      used.add(name)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.table_to_sheet(clone), name)
    }
    XLSX.writeFile(wb, `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return { readFileRows, exportTable, exportTables }
}

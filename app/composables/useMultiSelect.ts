/**
 * Centang banyak baris buat hapus massal — dipakai di semua modul bertabel.
 * Cuma nyimpen state pilihannya; logic hapusnya (endpoint, urutan hapus relasi, dst)
 * beda-beda per modul jadi tetap ditulis di halaman masing-masing.
 */
export function useMultiSelect() {
  const selectedIds = reactive(new Set<string>())

  function toggle(id: string) {
    selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id)
  }
  function toggleAll(ids: string[]) {
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id))
    for (const id of ids) {
      if (allSelected) selectedIds.delete(id)
      else selectedIds.add(id)
    }
  }
  function clear() {
    selectedIds.clear()
  }

  return { selectedIds, toggle, toggleAll, clear }
}

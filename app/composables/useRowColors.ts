export type RowColor = { id: string; entityKind: string; entityId: string; color: string }

export const ROW_PALETTE = ['#FFF3B0', '#B7F0AD', '#AEE3F5', '#F5B7B1', '#D7BDE2', '#FDD9B5']

/**
 * Warna baris hasil klik kanan, dipakai di semua modul bertabel.
 * Disimpan per (entityKind, entityId) di tabel row_colors.
 */
export function useRowColors(kind: string) {
  const api = useApi()
  const colors = ref<RowColor[]>([])

  async function load() {
    colors.value = await api<RowColor[]>('/api/row-colors')
  }

  function colorOf(id: string): string {
    return colors.value.find(c => c.entityKind === kind && c.entityId === id)?.color || ''
  }

  async function setColor(id: string, color: string) {
    if (color) {
      await api('/api/row-colors', { method: 'PUT', body: { entityKind: kind, entityId: id, color } })
    } else {
      await api(`/api/row-colors?entityKind=${kind}&entityId=${id}`, { method: 'DELETE' })
    }
    await load()
  }

  // -- state menu klik kanan --
  const menu = reactive({ visible: false, x: 0, y: 0, targetId: '' })

  function open(evt: MouseEvent, id: string) {
    evt.preventDefault()
    Object.assign(menu, { visible: true, x: evt.clientX, y: evt.clientY, targetId: id })
  }
  function close() { menu.visible = false }

  async function pick(color: string) {
    await setColor(menu.targetId, color)
    close()
  }

  return { colors, load, colorOf, setColor, menu, open, close, pick }
}

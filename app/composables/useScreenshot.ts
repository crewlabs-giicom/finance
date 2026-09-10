/** Capture satu elemen jadi PNG. html2canvas di-load dinamis, browser saja. */
export function useScreenshot() {
  const busy = ref(false)

  /** Coba salin langsung ke clipboard (biar tinggal Ctrl+V ke DingTalk/aplikasi lain).
   *  Browser yang gak dukung Clipboard API buat gambar (atau nolak izinnya) jatuh
   *  balik ke download file .png seperti biasa. */
  async function capture(el: HTMLElement, filenamePrefix: string): Promise<{ copied: boolean } | undefined> {
    if (import.meta.server || busy.value) return
    busy.value = true
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(el, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
        scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight
      })
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Gagal bikin gambar dari canvas.')

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          return { copied: true }
        } catch {
          // browser nolak (mis. gak ada izin clipboard-write) -> lanjut ke download di bawah
        }
      }

      const link = document.createElement('a')
      link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.png`
      link.href = URL.createObjectURL(blob)
      link.click()
      URL.revokeObjectURL(link.href)
      return { copied: false }
    } catch (e: any) {
      alert('Gagal bikin screenshot: ' + (e?.message || 'unknown error'))
      return undefined
    } finally {
      busy.value = false
    }
  }

  return { busy, capture }
}

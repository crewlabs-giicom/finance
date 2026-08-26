/** Capture satu elemen jadi PNG. html2canvas di-load dinamis, browser saja. */
export function useScreenshot() {
  const busy = ref(false)

  async function capture(el: HTMLElement, filenamePrefix: string) {
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
      const link = document.createElement('a')
      link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e: any) {
      alert('Gagal bikin screenshot: ' + (e?.message || 'unknown error'))
    } finally {
      busy.value = false
    }
  }

  return { busy, capture }
}

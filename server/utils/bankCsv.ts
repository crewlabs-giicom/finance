/**
 * Parser CSV mutasi bank (BCA & BRI), diport dari app HTML lama.
 * Dipindah ke server supaya file mentahnya tidak perlu diproses di browser
 * dan hasil parsing bisa langsung divalidasi terhadap master rekening.
 */

export type ParsedTxn = {
  noRek?: string
  tanggal: string
  transaksi: string
  cabang: string
  debet: number
  kredit: number
  saldo?: number
  // Referensi internal (mis. Journal No. BNI) dipakai CUMA buat dedup — bukan "No Bank"
  // yang keliatan di UI. Biar baris beda yang kebetulan tanggal/teks/nominalnya sama
  // (mis. biaya admin BNI yang keulang beberapa kali sehari) gak ketuker jadi "duplikat".
  importRef?: string
}

/**
 * Nol di depan nomor rekening kadang ilang waktu bank nulis kolom NOREK sebagai angka
 * (ketauan dari file BRI: nama filenya "..._057601020202308_..." tapi isi kolom NOREK-nya
 * cuma "57601020202308"). Dibanding apa adanya biar rekening yang beneran sama tetap kedetect.
 */
export function normalizeNoRek(v: string | null | undefined): string {
  return String(v ?? '').trim().replace(/^0+(?=\d)/, '')
}

/** CSV parser quote-aware, biar koma di dalam tanda kutip tidak memotong kolom. */
export function csvParseLines(text: string): string[][] {
  const lines: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const chars = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (inQuotes) {
      if (c === '"') {
        if (chars[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); field = ''; lines.push(row); row = [] }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); lines.push(row) }
  return lines.filter(r => r.some(f => f !== ''))
}

export function detectCsvFormat(rows: string[][]): 'bca' | 'bri' | 'bni' | null {
  const top = rows.slice(0, 10).map(r => r.join('|')).join('\n')
  if (/No\.\s*rekening/i.test(top)) return 'bca'
  const header = (rows[0] || []).map(h => h.trim().toUpperCase())
  if (header.includes('NOREK') && header.includes('MUTASI_DEBET')) return 'bri'
  if (header.includes('POST DATE') && header.includes('DESCRIPTION') && header.includes('DEBIT')) return 'bni'
  return null
}

/** BCA: Tanggal Transaksi | Keterangan | Cabang | Jumlah (CR/DB) | Saldo */
export function parseBcaCsv(rows: string[][]): { noRek: string; txns: ParsedTxn[]; saldoAwal: number | null } {
  let noRek = ''
  let headerIdx = -1
  let periodeStart: { d: number; m: number; y: number } | null = null
  let periodeEnd: { d: number; m: number; y: number } | null = null

  for (let i = 0; i < rows.length; i++) {
    const first = rows[i]?.[0] || ''
    if (!noRek) {
      const m = first.match(/No\.\s*rekening\s*:\s*(\S+)/i)
      if (m) noRek = m[1]!.trim()
    }
    if (!periodeStart) {
      const pm = first.match(/Periode\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i)
      if (pm) {
        periodeStart = { d: +pm[1]!, m: +pm[2]!, y: +pm[3]! }
        periodeEnd = { d: +pm[4]!, m: +pm[5]!, y: +pm[6]! }
      }
    }
    if ((rows[i]?.[0] || '').trim() === 'Tanggal Transaksi' && (rows[i]?.[1] || '').trim() === 'Keterangan') {
      headerIdx = i
      break
    }
  }

  const txns: ParsedTxn[] = []
  if (headerIdx > -1) {
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r || r.length < 5) continue
      const tanggalRaw = (r[0] || '').trim()
      if (!tanggalRaw) continue
      if (/^saldo awal/i.test(tanggalRaw) || /^mutasi/i.test(tanggalRaw) || /^saldo akhir/i.test(tanggalRaw)) break
      if (tanggalRaw.toUpperCase() === 'PEND') continue // belum posting final, dilewati

      let tanggal: string | null = null
      const dmy = tanggalRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (dmy) {
        tanggal = `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`
      } else {
        // sebagian export BCA cuma menulis "DD/MM" tanpa tahun — tahunnya diambil
        // dari baris "Periode : .. - .." di bagian atas file
        const dm2 = tanggalRaw.match(/^(\d{1,2})\/(\d{1,2})$/)
        if (dm2 && periodeStart) {
          const d = +dm2[1]!, mo = +dm2[2]!
          let y = periodeStart.y
          if (periodeEnd && periodeStart.y !== periodeEnd.y) {
            y = mo >= periodeStart.m ? periodeStart.y : periodeEnd.y
          }
          tanggal = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        }
      }
      if (!tanggal) continue

      const keterangan = (r[1] || '').replace(/\s+/g, ' ').trim()
      const cabang = (r[2] || '').trim()
      const jm = (r[3] || '').trim().match(/^([\d.,]+)\s*(CR|DB)$/i)
      let debet = 0, kredit = 0
      if (jm) {
        const amt = parseFloat(jm[1]!.replace(/,/g, '')) || 0
        if (jm[2]!.toUpperCase() === 'CR') kredit = amt
        else debet = amt
      }
      txns.push({ tanggal, transaksi: keterangan, cabang, debet, kredit })
    }
  }

  let saldoAwal: number | null = null
  for (const r of rows) {
    const m = (r[0] || '').match(/Saldo Awal\s*:\s*([\d.,\-]+)/i)
    if (m) { saldoAwal = parseFloat(m[1]!.replace(/,/g, '')); break }
  }

  return { noRek, txns, saldoAwal }
}

/** BRI: NOREK | TGL_TRAN | DESK_TRAN | MUTASI_DEBET | MUTASI_KREDIT | SALDO_AKHIR_MUTASI */
export function parseBriCsv(rows: string[][]): ParsedTxn[] {
  const header = (rows[0] || []).map(h => h.trim())
  const idx: Record<string, number> = {}
  header.forEach((h, i) => { idx[h.toUpperCase()] = i })

  const txns: ParsedTxn[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length < header.length) continue
    const noRek = (r[idx.NOREK!] || '').trim()
    const tglRaw = (r[idx.TGL_TRAN!] || '').trim()
    if (!noRek || !tglRaw) continue

    txns.push({
      noRek,
      tanggal: tglRaw.split(' ')[0]!,
      transaksi: (r[idx.DESK_TRAN!] || '').replace(/\s+/g, ' ').trim(),
      cabang: '',
      debet: parseFloat((r[idx.MUTASI_DEBET!] || '0').replace(/,/g, '')) || 0,
      kredit: parseFloat((r[idx.MUTASI_KREDIT!] || '0').replace(/,/g, '')) || 0,
      saldo: parseFloat((r[idx.SALDO_AKHIR_MUTASI!] || '0').replace(/,/g, '')) || 0
    })
  }
  return txns
}

/**
 * BNI: "Transaction Inquiry" export — Post Date | Value Date | Branch | Journal No. |
 * Description | Debit | Credit. Gak nyimpen nomor rekening di file-nya sama sekali
 * (beda dari BCA/BRI), jadi rekening tujuan ditentuin dari tipe akun "BNI" yang
 * terdaftar di Master Data, bukan dari isi file.
 */
export function parseBniCsv(rows: string[][]): ParsedTxn[] {
  const header = (rows[0] || []).map(h => h.trim().toUpperCase())
  const idx: Record<string, number> = {}
  header.forEach((h, i) => { idx[h] = i })

  const txns: ParsedTxn[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const postDateRaw = (r[idx['POST DATE']!] || '').trim()
    const dm = postDateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (!dm) continue
    let [, d, mo, y] = dm as unknown as [string, string, string, string]
    if (y.length === 2) y = (parseInt(y, 10) < 70 ? '20' : '19') + y
    const tanggal = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`

    const transaksi = (r[idx['DESCRIPTION']!] || '').replace(/\s+/g, ' ').trim()
    const cabang = (r[idx['BRANCH']!] || '').trim()
    const debet = parseFloat((r[idx['DEBIT']!] || '0').replace(/,/g, '')) || 0
    const kredit = parseFloat((r[idx['CREDIT']!] || '0').replace(/,/g, '')) || 0
    const importRef = (r[idx['JOURNAL NO.']!] ?? r[idx['JOURNAL NO']!] ?? '').trim()
    if (!transaksi && !debet && !kredit) continue

    txns.push({ tanggal, transaksi, cabang, debet, kredit, importRef })
  }
  return txns
}

// Pola teks mutasi BCA yang bisa dipecah otomatis jadi "Ket Transaksi".
const KET_TRANSAKSI_RULES: { re: RegExp; get: (m: RegExpMatchArray) => string }[] = [
  { re: /^TRSF\s+E-BANKING\s+(?:CR|DB)\s+\d+\/FTSCY\/WS\d+\s+[\d.,]+\s+(.+)$/i, get: m => m[1]! },
  { re: /^BI-FAST\s+(?:CR|DB)\s+BIAYA\s+TXN\s+(?:DR|KE)\s+(.+)$/i, get: m => m[1]! },
  { re: /^BI-FAST\s+(?:CR|DB)\s+TRANSFER\s+(?:DR|KE)\s+\d+\s+(.+)$/i, get: m => m[1]! },
  { re: /^KR\s+OTOMATIS\s+LLG-CITIBANK\s+PT\s+ECART\s+(.+)$/i, get: m => m[1]! },
  { re: /^BYR\s+VIA\s+E-BANKING\s+\d{1,2}\/\d{1,2}\s+\d+\s+(.+)$/i, get: m => m[1]! },
  { re: /^SETORAN\s+TUNAI\s*(.*)$/i, get: m => m[1]! }
]

export function deriveKetTransaksi(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw).trim()
  for (const rule of KET_TRANSAKSI_RULES) {
    const m = s.match(rule.re)
    if (m) return rule.get(m).replace(/\s+/g, ' ').trim()
  }
  return ''
}

/** Kunci dedup transaksi — sama persis dengan mpTxnDupKey() di app lama. */
export function txnDupKey(t: { accountId: string; tanggal: string; transaksi: string; debet: number; kredit: number }) {
  return `${t.accountId}|${t.tanggal}|${t.transaksi}|${t.debet}|${t.kredit}`
}

/**
 * Varian txnDupKey yang nyelipin referensi internal (importRef) — dipakai buat
 * format kayak BNI, yang bisa punya beberapa baris beda (mis. biaya admin) dengan
 * tanggal/teks/nominal identik dalam sehari. Cuma dipakai kalau ref-nya keisi;
 * BCA/BRI (importRef selalu kosong pas import) sama sekali gak kepengaruh.
 */
export function txnDupKeyWithRef(t: { accountId: string; tanggal: string; transaksi: string; debet: number; kredit: number }, ref: string) {
  return `${txnDupKey(t)}|${ref}`
}

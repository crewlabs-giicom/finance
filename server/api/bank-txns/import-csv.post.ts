import { bankAccounts, bankTxns } from '../../database/schema'
import { csvParseLines, detectCsvFormat, deriveKetTransaksi, matchAccountByFilename, normalizeNoRek, parseBcaCsv, parseBniCsv, parseBriCsv, txnDupKey, txnDupKeyWithRef } from '../../utils/bankCsv'

/**
 * Import mutasi bank dari CSV BCA, BRI, atau BNI.
 * Body: { csv: "<isi file>" }. Format dideteksi otomatis dari isinya.
 *
 * Baris duplikat dan baris yang tanggalnya masuk periode terkunci dilewati
 * (tidak menggagalkan seluruh import), lalu saldo berjalan dihitung ulang.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const csv = String(body.csv || '')
  const filename = String(body.filename || '')
  if (!csv.trim()) throw createError({ statusCode: 400, statusMessage: 'Isi file CSV kosong.' })

  const rows = csvParseLines(csv)
  const format = detectCsvFormat(rows)
  if (!format) {
    throw createError({ statusCode: 400, statusMessage: 'Format file tidak dikenali. Pakai file mutasi asli dari BCA, BRI, atau BNI.' })
  }

  const accounts = await db.select().from(bankAccounts)
  const existing = await db.select().from(bankTxns)
  const seen = new Set(existing.map(t => txnDupKey(t as any)))
  // Baris lama yang punya importRef (mis. hasil import BNI sebelumnya) juga ke-index
  // pakai key yang nyelipin ref-nya, biar re-import file yang sama kedetect.
  for (const t of existing) {
    if (t.importRef) seen.add(txnDupKeyWithRef(t as any, t.importRef))
  }
  const lockYm = await getPeriodLockYm()

  const toInsert: typeof bankTxns.$inferInsert[] = []
  const touchedAccounts = new Map<string, number | null>()
  const noAccountNoRek = new Set<string>()
  let dup = 0, locked = 0, noAccount = 0

  function push(acc: typeof accounts[number], t: { tanggal: string; transaksi: string; cabang: string; debet: number; kredit: number; importRef?: string }, saldoAwal: number | null) {
    if (lockYm && t.tanggal.slice(0, 7) <= lockYm) { locked++; return }
    const key = t.importRef ? txnDupKeyWithRef({ accountId: acc.id, ...t }, t.importRef) : txnDupKey({ accountId: acc.id, ...t })
    if (seen.has(key)) { dup++; return }
    seen.add(key)
    toInsert.push({
      id: genId('bt'), accountId: acc.id, tanggal: t.tanggal, transaksi: t.transaksi,
      cabang: t.cabang, debet: t.debet, kredit: t.kredit, saldo: 0,
      bankType: acc.bankType, noBankManual: '', importRef: t.importRef || null,
      ketTransaksiManual: deriveKetTransaksi(t.transaksi),
      tag: '', noteManual: '', checked: false, manual: false
    })
    if (!touchedAccounts.has(acc.id)) touchedAccounts.set(acc.id, saldoAwal)
  }

  let ringkasanRekening = ''

  if (format === 'bca') {
    const parsed = parseBcaCsv(rows)
    if (!parsed.noRek) {
      throw createError({ statusCode: 400, statusMessage: 'Gak nemu nomor rekening di file CSV ini — pastikan file mutasi asli dari BCA.' })
    }
    const acc = accounts.find(a => normalizeNoRek(a.noRek) === normalizeNoRek(parsed.noRek))
    if (!acc) {
      throw createError({
        statusCode: 404,
        statusMessage: `Nomor rekening ${parsed.noRek} belum terdaftar. Tambahkan dulu di Master Data → Rekening Bank, lalu upload ulang.`
      })
    }
    for (const t of parsed.txns) push(acc, t, parsed.saldoAwal)
    ringkasanRekening = `${acc.namaRek} (${acc.noRek})`
  } else if (format === 'bri') {
    const parsed = parseBriCsv(rows)
    if (!parsed.length) {
      throw createError({ statusCode: 400, statusMessage: 'Gak ada baris transaksi valid di file ini — pastikan file mutasi asli dari BRI.' })
    }
    const namaRek = new Set<string>()
    for (const t of parsed) {
      const acc = accounts.find(a => normalizeNoRek(a.noRek) === normalizeNoRek(t.noRek))
      if (!acc) { noAccount++; noAccountNoRek.add(t.noRek); continue }
      push(acc, { tanggal: t.tanggal, transaksi: t.transaksi, cabang: t.cabang, debet: t.debet, kredit: t.kredit }, null)
      namaRek.add(`${acc.namaRek} (${acc.noRek})`)
    }
    ringkasanRekening = [...namaRek].join(', ') || '-'
  } else {
    // File BNI gak nyimpen nomor rekening sama sekali, jadi rekening tujuan ditentuin
    // dari rekening bertipe "BNI" yang terdaftar — cuma bisa otomatis kalau persis satu.
    const parsed = parseBniCsv(rows)
    if (!parsed.length) {
      throw createError({ statusCode: 400, statusMessage: 'Gak ada baris transaksi valid di file ini — pastikan file mutasi asli dari BNI.' })
    }
    const bniAccounts = accounts.filter(a => a.bankType === 'BNI')
    if (bniAccounts.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Belum ada rekening bertipe BNI di Master Data. Tambahkan dulu (Bank: BNI) di Master Data → Rekening Bank, lalu upload ulang.'
      })
    }

    let acc: typeof bniAccounts[number]
    if (bniAccounts.length === 1) {
      acc = bniAccounts[0]!
    } else {
      // File BNI gak nyimpen nomor rekening di isinya sama sekali, jadi kalau rekening
      // BNI-nya lebih dari satu, tebak dari nama filenya (mis. mengandung No. Rekening / Nama Rekening).
      const matches = matchAccountByFilename(filename, bniAccounts)
      if (matches.length === 1) {
        acc = matches[0]!
      } else if (matches.length === 0) {
        throw createError({
          statusCode: 409,
          statusMessage: `File BNI ini gak nyimpen nomor rekening, dan ada ${bniAccounts.length} rekening BNI terdaftar (${bniAccounts.map(a => a.namaRek).join(', ')}) — nama file "${filename || '(tanpa nama)'}" gak cocok sama satu pun. Ganti nama filenya biar mengandung nomor rekening atau nama rekeningnya, lalu upload ulang.`
        })
      } else {
        throw createError({
          statusCode: 409,
          statusMessage: `Nama file "${filename}" cocok sama ${matches.length} rekening BNI sekaligus (${matches.map(a => a.namaRek).join(', ')}) — gak bisa ditentuin otomatis punya rekening yang mana. Perjelas nama filenya.`
        })
      }
    }
    for (const t of parsed) push(acc, t, null)
    ringkasanRekening = `${acc.namaRek} (${acc.noRek})`
  }

  // Auto-generate "No Bank" buat baris yang rekeningnya punya format diset di Master Data.
  const autoNoBank = await generateNoBankBatch(toInsert.map(t => ({ accountId: t.accountId, debet: t.debet, kredit: t.kredit, tanggal: t.tanggal! })))
  toInsert.forEach((t, i) => { if (autoNoBank[i]) t.noBankManual = autoNoBank[i]! })

  for (let i = 0; i < toInsert.length; i += 500) {
    await db.insert(bankTxns).values(toInsert.slice(i, i + 500))
  }
  for (const [accId, saldoAwal] of touchedAccounts) {
    await recomputeAccountSaldo(accId, saldoAwal)
  }

  const tanggalBaru = toInsert.map(t => t.tanggal!).sort()

  return {
    format,
    rekening: ringkasanRekening,
    imported: toInsert.length,
    duplikat: dup,
    terkunci: locked,
    rekeningTidakTerdaftar: noAccount,
    rekeningTidakTerdaftarNoRek: [...noAccountNoRek],
    lockYm,
    tanggalTerbaru: tanggalBaru.at(-1) || null
  }
})

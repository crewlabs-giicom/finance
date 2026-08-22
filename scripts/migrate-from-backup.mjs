#!/usr/bin/env node
/**
 * Migrasi data dari backup JSON aplikasi HTML lama (tombol "Export Backup")
 * ke database SQLite aplikasi Nuxt yang baru.
 *
 * Cara pakai:
 *   DATABASE_PATH=./data/finance.db node scripts/migrate-from-backup.mjs /path/ke/backup-rekap-saldo-2026-08-20.json
 *
 * Aman dijalankan berkali-kali? TIDAK — script ini INSERT baris baru, bukan upsert.
 * Jalankan cuma SEKALI ke database yang masih kosong (baru di-migrate lewat drizzle-kit,
 * belum ada data lain). Kalau perlu ulang, hapus dulu file data/finance.db lalu migrate ulang skemanya.
 */
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const backupPath = process.argv[2]
if (!backupPath) {
  console.error('Pemakaian: node scripts/migrate-from-backup.mjs <path-ke-backup.json>')
  process.exit(1)
}

const dbPath = process.env.DATABASE_PATH || './data/finance.db'
const db = new Database(dbPath)
db.pragma('foreign_keys = OFF') // dimatikan sementara biar urutan insert bebas, dinyalain lagi di akhir

const raw = JSON.parse(readFileSync(backupPath, 'utf-8'))
const data = raw.data || raw // toleran kalau file yang dikasih cuma isi `data`-nya aja

function genId(prefix) {
  return prefix + Date.now().toString(36) + randomBytes(5).toString('hex')
}

let stats = {}
function log(key, n) {
  stats[key] = n
  console.log(`  ${key}: ${n} baris`)
}

const tx = db.transaction(() => {
  // ---------- bank_groups ----------
  if (Array.isArray(data.bankGroups)) {
    const stmt = db.prepare('INSERT INTO bank_groups (id, nama, warna) VALUES (?, ?, ?)')
    data.bankGroups.forEach(g => stmt.run(g.id, g.nama, g.warna || null))
    log('bank_groups', data.bankGroups.length)
  }

  // ---------- bank_balances (dari array `bank[]` lama, panel "Saldo Rekening Bank") ----------
  if (Array.isArray(data.bank)) {
    const stmt = db.prepare('INSERT INTO bank_balances (id, pic, rek, saldo, bisa_dipakai, ket, grup) VALUES (?, ?, ?, ?, ?, ?, ?)')
    data.bank.forEach(b => stmt.run(b.id, b.pic || '', b.rek || '', b.saldo || 0, b.bisaDipakai ?? null, b.ket || '', b.grup || null))
    log('bank_balances', data.bank.length)
  }

  // ---------- bank_accounts (Rincian Bank, dari `bankAccounts[]`) ----------
  if (Array.isArray(data.bankAccounts)) {
    const stmt = db.prepare('INSERT INTO bank_accounts (id, group_id, bank_type, nama_rek, no_rek, saldo) VALUES (?, ?, ?, ?, ?, ?)')
    data.bankAccounts.forEach(a => stmt.run(a.id, a.grup || null, a.bankType || '', a.namaRek || '', a.noRek || '', 0))
    log('bank_accounts', data.bankAccounts.length)
  }

  // ---------- bank_txns ----------
  if (Array.isArray(data.bankTxns)) {
    const stmt = db.prepare(`INSERT INTO bank_txns
      (id, account_id, tanggal, transaksi, cabang, debet, kredit, saldo, bank_type, no_bank_manual, ket_transaksi_manual, tag, note_manual, checked, manual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    let n = 0
    data.bankTxns.forEach(t => {
      if (!t.accountId || !t.tanggal) return // skip baris rusak — FK/NOT NULL bakal gagal
      stmt.run(t.id, t.accountId, t.tanggal, t.transaksi || '', t.cabang || '', t.debet || 0, t.kredit || 0, t.saldo || 0,
        t.bankType || '', t.noBankManual || '', t.ketTransaksiManual || '', t.tag || '', t.noteManual || '',
        t.checked ? 1 : 0, t.manual ? 1 : 0)
      n++
    })
    log('bank_txns', n)
  }

  // ---------- deposito / hutang / bayar ----------
  if (Array.isArray(data.deposito)) {
    const stmt = db.prepare('INSERT INTO deposito_rows (id, nama, nominal, tgl_masuk, rate, jatuh_tempo, ket) VALUES (?, ?, ?, ?, ?, ?, ?)')
    data.deposito.forEach(d => stmt.run(genId('dep'), d.nama || '', d.nominal || 0, d.tglMasuk || null, d.rate || '', d.jatuhTempo || null, d.ket || ''))
    log('deposito_rows', data.deposito.length)
  }
  if (Array.isArray(data.hutang)) {
    const stmt = db.prepare('INSERT INTO hutang_rows (id, peminjam, kreditur, nominal, rate, tgl_pinjam, jatuh_tempo, ket) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    data.hutang.forEach(h => stmt.run(genId('hut'), h.peminjam || '', h.kreditur || '', h.nominal || 0, h.rate || '', h.tglPinjam || null, h.jatuhTempo || null, h.ket || ''))
    log('hutang_rows', data.hutang.length)
  }
  if (Array.isArray(data.bayar)) {
    const stmt = db.prepare('INSERT INTO bayar_rows (id, pt, nominal, tgl_bayar, tgl_pesan, no_ctr, pay_iam, pay_ekspds, ket) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    data.bayar.forEach(b => stmt.run(genId('byr'), b.pt || '', b.nominal || 0, b.tglBayar || null, b.tglPesan || null, b.noCtr || '', b.payIam || '', b.payEkspds || '', b.ket || ''))
    log('bayar_rows', data.bayar.length)
  }

  // ---------- mp_stores + mp_entries (dari mpStores[] + mpRows[].vals) ----------
  if (Array.isArray(data.mpStores)) {
    const stmt = db.prepare('INSERT INTO mp_stores (id, group_id, nama, platform, saldo_awal) VALUES (?, ?, ?, ?, ?)')
    data.mpStores.forEach(s => stmt.run(s.id, s.grup || null, s.nama || '', s.platform || '', s.saldoAwal || 0))
    log('mp_stores', data.mpStores.length)
  }
  if (Array.isArray(data.mpRows)) {
    const stmt = db.prepare('INSERT INTO mp_entries (id, store_id, tanggal, debet, kredit) VALUES (?, ?, ?, ?, ?)')
    let n = 0
    data.mpRows.forEach(row => {
      const vals = row.vals || {}
      Object.keys(vals).forEach(storeId => {
        const v = vals[storeId] || {}
        if (!v.d && !v.k) return // skip sel kosong
        stmt.run(genId('mpe'), storeId, row.tanggal, v.d || 0, v.k || 0)
        n++
      })
    })
    log('mp_entries', n)
  }

  // ---------- npwp_master, coa_master, tag_master, aset_simple_master ----------
  if (Array.isArray(data.npwpMaster)) {
    const stmt = db.prepare('INSERT INTO npwp_master (id, no_npwp, nama_npwp, nik, alamat) VALUES (?, ?, ?, ?, ?)')
    data.npwpMaster.forEach(n => stmt.run(n.id, n.noNpwp || '', n.namaNpwp || '', n.nik || '', n.alamat || ''))
    log('npwp_master', data.npwpMaster.length)
  }
  if (Array.isArray(data.coaMaster)) {
    const stmt = db.prepare('INSERT INTO coa_master (id, no_coa, nama_coa) VALUES (?, ?, ?)')
    data.coaMaster.forEach(c => stmt.run(c.id, c.noCoa || '', c.namaCoa || ''))
    log('coa_master', data.coaMaster.length)
  }
  if (Array.isArray(data.tagMaster)) {
    const stmt = db.prepare('INSERT INTO tag_master (id, nama) VALUES (?, ?)')
    data.tagMaster.forEach(nama => stmt.run(genId('tag'), nama))
    log('tag_master', data.tagMaster.length)
  }
  const asetSimpleStmt = db.prepare('INSERT INTO aset_simple_master (id, kind, value) VALUES (?, ?, ?)')
  let asetSimpleN = 0
  ;(data.asetTipeMaster || []).forEach(v => { asetSimpleStmt.run(genId('ast'), 'tipe', v); asetSimpleN++ })
  ;(data.asetKategoriMaster || []).forEach(v => { asetSimpleStmt.run(genId('ast'), 'kategori', v); asetSimpleN++ })
  ;(data.asetDivMaster || []).forEach(v => { asetSimpleStmt.run(genId('ast'), 'div', v); asetSimpleN++ })
  if (asetSimpleN) log('aset_simple_master', asetSimpleN)

  // ---------- ppn_rows (List Pajak) ----------
  if (Array.isArray(data.ppnRows)) {
    const stmt = db.prepare(`INSERT INTO ppn_rows
      (id, source_txn_id, group_id, tanggal, code, store, description, tags, debet, kredit, note, npwp_id, no_invoice,
       net_dibayarkan, ppn, dpp, pph23, pph23_4a2, pph21bp, lampiran_faktur_pajak, masa_kredit, bentuk_jenis_biaya)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    data.ppnRows.forEach(r => stmt.run(
      r.id, r.sourceTxnId || null, r.groupId || null, r.tanggal, r.code || '', r.store || '', r.description || '',
      r.tags || '', r.debet || 0, r.kredit || 0, r.note || '', r.npwpId || null, r.noInvoice || '',
      r.netDibayarkan ?? null, r.ppn ?? null, r.dpp ?? null, r.pph23 ?? null, r.pph23_4a2 ?? null, r.pph21bp ?? null,
      r.lampiranFakturPajak || '', r.masaKredit || '', r.bentukJenisBiaya || ''
    ))
    log('ppn_rows', data.ppnRows.length)
  }

  // ---------- ent_rows (Entertainment) ----------
  if (Array.isArray(data.entRows)) {
    const stmt = db.prepare(`INSERT INTO ent_rows
      (id, source_txn_id, group_id, tanggal, place, alamat, description, jenis, amount, client_name, posisi, company, jenis_usaha, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    data.entRows.forEach(r => stmt.run(
      r.id, r.sourceTxnId || null, r.groupId || null, r.tanggal, r.place || '', r.alamat || '', r.description || '',
      r.jenis || '', r.amount || 0, r.clientName || '', r.posisi || '', r.company || '', r.jenisUsaha || '', r.note || ''
    ))
    log('ent_rows', data.entRows.length)
  }

  // ---------- avp_rows + avp_lawan (Aktiva-Pasiva) ----------
  if (Array.isArray(data.avpRows)) {
    const stmt = db.prepare(`INSERT INTO avp_rows (id, coa_id, group_id, tanggal, code, store, description, tags, debet, kredit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    data.avpRows.forEach(r => stmt.run(r.id, r.coaId || null, r.groupId || null, r.tanggal, r.code || '', r.store || '',
      r.description || '', r.tags || '', r.debet || 0, r.kredit || 0))
    log('avp_rows', data.avpRows.length)

    const lawanStmt = db.prepare('INSERT INTO avp_lawan (id, row_id, partner_id) VALUES (?, ?, ?)')
    let lawanN = 0
    const validIds = new Set(data.avpRows.map(r => r.id))
    data.avpRows.forEach(r => {
      ;(r.lawanIds || []).forEach(pid => {
        if (!validIds.has(pid)) return // skip kalau baris pasangannya gak ketemu (data korup)
        lawanStmt.run(genId('avpl'), r.id, pid)
        lawanN++
      })
    })
    if (lawanN) log('avp_lawan', lawanN)
  }

  // ---------- te_gudang_rows, te_finance_rows (Tagihan Ekspedisi) ----------
  if (Array.isArray(data.teGudangRows)) {
    const stmt = db.prepare('INSERT INTO te_gudang_rows (id, tanggal, nama_pengirim, nama_penerima, inv_gii, no_waybill, biaya, keperluan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    data.teGudangRows.forEach(r => stmt.run(r.id, r.tanggal || null, r.namaPengirim || '', r.namaPenerima || '', r.invGii || '', r.noWaybill, r.biaya || 0, r.keperluan || ''))
    log('te_gudang_rows', data.teGudangRows.length)
  }
  if (Array.isArray(data.teFinanceRows)) {
    const stmt = db.prepare('INSERT INTO te_finance_rows (id, tanggal, no_waybill, biaya, nama_penerima, keterangan) VALUES (?, ?, ?, ?, ?, ?)')
    data.teFinanceRows.forEach(r => stmt.run(r.id, r.tanggal || null, r.noWaybill, r.biaya || 0, r.namaPenerima || '', r.keterangan || ''))
    log('te_finance_rows', data.teFinanceRows.length)
  }

  // ---------- aset_rows + aset_depresiasi_log ----------
  if (Array.isArray(data.asetRows)) {
    const stmt = db.prepare(`INSERT INTO aset_rows
      (id, tipe, kategori, grup_id, div, nama, deposit, bank_account_id, tgl_mulai, no_aset, keterangan, umur_ekonomis, harga_perolehan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    data.asetRows.forEach(r => stmt.run(
      r.id, r.tipe || '', r.kategori || '', r.grupId || null, r.div || '', r.nama, r.deposit || 0,
      r.bankAccountId || null, r.tglMulai || null, r.noAset || '', r.keterangan || '', r.umurEkonomis || 0, r.hargaPerolehan || 0
    ))
    log('aset_rows', data.asetRows.length)

    const depStmt = db.prepare('INSERT INTO aset_depresiasi_log (id, aset_id, periode, tanggal) VALUES (?, ?, ?, ?)')
    let depN = 0
    data.asetRows.forEach(r => {
      ;(r.depresiasiLog || []).forEach(d => { depStmt.run(genId('adl'), r.id, d.periode, d.tanggal); depN++ })
    })
    if (depN) log('aset_depresiasi_log', depN)
  }

  // ---------- period_lock ----------
  if (data.periodLock) {
    db.prepare('INSERT OR REPLACE INTO period_lock (id, lock_ym) VALUES (1, ?)').run(data.periodLock)
    log('period_lock', 1)
  }

  // ---------- row_colors: TIDAK ada di backup lama (disimpan terpisah di localStorage,
  // tidak pernah ikut ke-export). Warna baris gak bisa ikut kepindah otomatis — ini
  // batasan aplikasi lama, bukan bug migrasi. ----------
})

console.log(`Migrasi dari: ${backupPath}`)
console.log(`Ke database: ${dbPath}`)
console.log('')
tx()
db.pragma('foreign_keys = ON')
db.close()
console.log('')
console.log('✅ Migrasi selesai. Catatan: warna baris (row colors) tidak ikut pindah — itu memang tidak pernah tersimpan di file backup aplikasi lama.')

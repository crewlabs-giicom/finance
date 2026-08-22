#!/usr/bin/env node
/**
 * Migrasi data dari backup JSON aplikasi HTML lama (tombol "Export Backup")
 * ke database MySQL aplikasi Nuxt yang baru.
 *
 * Cara pakai:
 *   node scripts/migrate-from-backup.mjs legacy/backup-rekap-saldo-2026-08-22.json
 *
 * DATABASE_URL dibaca dari environment, atau dari file .env di root project.
 *
 * Aman dijalankan berkali-kali? TIDAK — script ini INSERT baris baru, bukan upsert.
 * Jalankan cuma SEKALI ke database yang masih kosong (baru di-migrate lewat drizzle-kit,
 * belum ada data lain). Kalau perlu ulang, jalankan dengan flag --reset untuk mengosongkan
 * dulu seluruh tabel data (tabel `users` tidak disentuh).
 */
import mysql from 'mysql2/promise'
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const args = process.argv.slice(2)
const reset = args.includes('--reset')
const backupPath = args.find(a => !a.startsWith('--'))
if (!backupPath) {
  console.error('Pemakaian: node scripts/migrate-from-backup.mjs <path-ke-backup.json> [--reset]')
  process.exit(1)
}

// .env loader sederhana — script ini jalan di luar Nuxt jadi tidak ada auto-load.
if (!process.env.DATABASE_URL && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL belum diset (di environment atau file .env).')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(backupPath, 'utf-8'))
const data = raw.data || raw // toleran kalau file yang dikasih cuma isi `data`-nya aja

function genId(prefix) {
  return prefix + Date.now().toString(36) + randomBytes(5).toString('hex')
}

const conn = await mysql.createConnection({ uri: dbUrl, multipleStatements: true })

const stats = {}
/** Bulk insert satu tabel dalam satu query — jauh lebih cepat daripada per-baris, penting waktu jalan ke MySQL cPanel. */
async function insertMany(table, cols, rows) {
  if (!rows.length) return
  await conn.query(`INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(', ')}) VALUES ?`, [rows])
  stats[table] = (stats[table] || 0) + rows.length
  console.log(`  ${table}: ${rows.length} baris`)
}

// Urutan penting waktu --reset: anak dulu, baru induk.
const TABLES_CHILD_FIRST = [
  'aset_depresiasi_log', 'aset_rows', 'aset_simple_master',
  'avp_lawan', 'avp_rows', 'coa_master',
  'dn_rows', 'ent_rows', 'ppn_rows', 'npwp_master',
  'te_finance_rows', 'te_gudang_rows',
  'mp_entries', 'mp_stores',
  'bank_txns', 'bank_accounts', 'bank_balances', 'bank_groups',
  'deposito_rows', 'hutang_rows', 'bayar_rows',
  'tag_master', 'row_colors', 'period_lock'
]

console.log(`Migrasi dari: ${backupPath}`)
console.log(`Ke database : ${dbUrl.replace(/:[^:@/]*@/, ':****@')}`)
console.log('')

await conn.query('SET FOREIGN_KEY_CHECKS = 0')
await conn.beginTransaction()

try {
  if (reset) {
    for (const t of TABLES_CHILD_FIRST) await conn.query(`DELETE FROM \`${t}\``)
    console.log('  (--reset) seluruh tabel data dikosongkan, tabel users tidak disentuh')
    console.log('')
  }

  // ---------- bank_groups ----------
  await insertMany('bank_groups', ['id', 'nama', 'warna'],
    (data.bankGroups || []).map(g => [g.id, g.nama, g.warna || null]))

  // ---------- bank_balances (dari array `bank[]` lama, panel "Saldo Rekening Bank") ----------
  await insertMany('bank_balances', ['id', 'pic', 'rek', 'saldo', 'bisa_dipakai', 'ket', 'grup'],
    (data.bank || []).map(b => [b.id, b.pic || '', b.rek || '', b.saldo || 0, b.bisaDipakai ?? null, b.ket || '', b.grup || null]))

  // ---------- bank_accounts (Rincian Bank, dari `bankAccounts[]`) ----------
  await insertMany('bank_accounts', ['id', 'group_id', 'bank_type', 'nama_rek', 'no_rek', 'saldo_awal'],
    (data.bankAccounts || []).map(a => [a.id, a.grup || null, a.bankType || '', a.namaRek || '', a.noRek || '', a.saldoAwal ?? null]))

  // ---------- bank_txns ----------
  await insertMany('bank_txns',
    ['id', 'account_id', 'tanggal', 'transaksi', 'cabang', 'debet', 'kredit', 'saldo', 'bank_type', 'no_bank_manual', 'ket_transaksi_manual', 'tag', 'note_manual', 'checked', 'manual'],
    (data.bankTxns || [])
      .filter(t => t.accountId && t.tanggal) // skip baris rusak — FK/NOT NULL bakal gagal
      .map(t => [t.id, t.accountId, t.tanggal, t.transaksi || '', t.cabang || '', t.debet || 0, t.kredit || 0, t.saldo || 0,
        t.bankType || '', t.noBankManual || '', t.ketTransaksiManual || '', t.tag || '', t.noteManual || '',
        t.checked ? 1 : 0, t.manual ? 1 : 0]))

  // ---------- deposito / hutang / bayar ----------
  await insertMany('deposito_rows', ['id', 'nama', 'nominal', 'tgl_masuk', 'rate', 'jatuh_tempo', 'ket'],
    (data.deposito || []).map(d => [genId('dep'), d.nama || '', d.nominal || 0, d.tglMasuk || null, d.rate || '', d.jatuhTempo || null, d.ket || '']))
  await insertMany('hutang_rows', ['id', 'peminjam', 'kreditur', 'nominal', 'rate', 'tgl_pinjam', 'jatuh_tempo', 'ket'],
    (data.hutang || []).map(h => [genId('hut'), h.peminjam || '', h.kreditur || '', h.nominal || 0, h.rate || '', h.tglPinjam || null, h.jatuhTempo || null, h.ket || '']))
  await insertMany('bayar_rows', ['id', 'pt', 'nominal', 'tgl_bayar', 'tgl_pesan', 'no_ctr', 'pay_iam', 'pay_ekspds', 'ket'],
    (data.bayar || []).map(b => [genId('byr'), b.pt || '', b.nominal || 0, b.tglBayar || null, b.tglPesan || null, b.noCtr || '', b.payIam || '', b.payEkspds || '', b.ket || '']))

  // ---------- mp_stores + mp_entries (dari mpStores[] + mpRows[].vals) ----------
  await insertMany('mp_stores', ['id', 'group_id', 'nama', 'platform', 'saldo_awal'],
    (data.mpStores || []).map(s => [s.id, s.grup || null, s.nama || '', s.platform || '', s.saldoAwal || 0]))

  const mpEntries = []
  for (const row of data.mpRows || []) {
    for (const [storeId, v] of Object.entries(row.vals || {})) {
      if (!v?.d && !v?.k) continue // skip sel kosong
      mpEntries.push([genId('mpe'), storeId, row.tanggal, v.d || 0, v.k || 0])
    }
  }
  await insertMany('mp_entries', ['id', 'store_id', 'tanggal', 'debet', 'kredit'], mpEntries)

  // ---------- npwp_master, coa_master, tag_master, aset_simple_master ----------
  await insertMany('npwp_master', ['id', 'no_npwp', 'nama_npwp', 'nik', 'alamat'],
    (data.npwpMaster || []).map(n => [n.id, n.noNpwp || '', n.namaNpwp || '', n.nik || '', n.alamat || '']))
  await insertMany('coa_master', ['id', 'no_coa', 'nama_coa'],
    (data.coaMaster || []).map(c => [c.id, c.noCoa || '', c.namaCoa || '']))
  await insertMany('tag_master', ['id', 'nama'],
    (data.tagMaster || []).map(nama => [genId('tag'), nama]))

  await insertMany('aset_simple_master', ['id', 'kind', 'value'], [
    ...(data.asetTipeMaster || []).map(v => [genId('ast'), 'tipe', v]),
    ...(data.asetKategoriMaster || []).map(v => [genId('ast'), 'kategori', v]),
    ...(data.asetDivMaster || []).map(v => [genId('ast'), 'div', v])
  ])

  // ---------- ppn_rows (List Pajak) ----------
  await insertMany('ppn_rows',
    ['id', 'source_txn_id', 'group_id', 'tanggal', 'code', 'store', 'description', 'tags', 'debet', 'kredit', 'note', 'npwp_id', 'no_invoice',
      'net_dibayarkan', 'ppn', 'dpp', 'pph23', 'pph23_4a2', 'pph21bp', 'lampiran_faktur_pajak', 'masa_kredit', 'bentuk_jenis_biaya'],
    (data.ppnRows || []).map(r => [
      r.id, r.sourceTxnId || null, r.groupId || null, r.tanggal, r.code || '', r.store || '', r.description || '',
      r.tags || '', r.debet || 0, r.kredit || 0, r.note || '', r.npwpId || null, r.noInvoice || '',
      r.netDibayarkan ?? null, r.ppn ?? null, r.dpp ?? null, r.pph23 ?? null, r.pph23_4a2 ?? null, r.pph21bp ?? null,
      r.lampiranFakturPajak || '', r.masaKredit || '', r.bentukJenisBiaya || ''
    ]))

  // ---------- ent_rows (Entertainment) ----------
  await insertMany('ent_rows',
    ['id', 'source_txn_id', 'group_id', 'tanggal', 'place', 'alamat', 'description', 'jenis', 'amount', 'client_name', 'posisi', 'company', 'jenis_usaha', 'note'],
    (data.entRows || []).map(r => [
      r.id, r.sourceTxnId || null, r.groupId || null, r.tanggal, r.place || '', r.alamat || '', r.description || '',
      r.jenis || '', r.amount || 0, r.clientName || '', r.posisi || '', r.company || '', r.jenisUsaha || '', r.note || ''
    ]))

  // ---------- avp_rows + avp_lawan (Aktiva-Pasiva) ----------
  await insertMany('avp_rows', ['id', 'coa_id', 'group_id', 'tanggal', 'code', 'store', 'description', 'tags', 'debet', 'kredit'],
    (data.avpRows || []).map(r => [r.id, r.coaId || null, r.groupId || null, r.tanggal, r.code || '', r.store || '',
      r.description || '', r.tags || '', r.debet || 0, r.kredit || 0]))

  const validAvpIds = new Set((data.avpRows || []).map(r => r.id))
  const lawan = []
  for (const r of data.avpRows || []) {
    for (const pid of r.lawanIds || []) {
      if (!validAvpIds.has(pid)) continue // skip kalau baris pasangannya gak ketemu (data korup)
      lawan.push([genId('avpl'), r.id, pid])
    }
  }
  await insertMany('avp_lawan', ['id', 'row_id', 'partner_id'], lawan)

  // ---------- te_gudang_rows, te_finance_rows (Tagihan Ekspedisi) ----------
  await insertMany('te_gudang_rows', ['id', 'tanggal', 'nama_pengirim', 'nama_penerima', 'inv_gii', 'no_waybill', 'biaya', 'keperluan'],
    (data.teGudangRows || []).map(r => [r.id, r.tanggal || null, r.namaPengirim || '', r.namaPenerima || '', r.invGii || '', r.noWaybill, r.biaya || 0, r.keperluan || '']))
  await insertMany('te_finance_rows', ['id', 'tanggal', 'no_waybill', 'biaya', 'nama_penerima', 'keterangan'],
    (data.teFinanceRows || []).map(r => [r.id, r.tanggal || null, r.noWaybill, r.biaya || 0, r.namaPenerima || '', r.keterangan || '']))

  // ---------- aset_rows + aset_depresiasi_log ----------
  await insertMany('aset_rows',
    ['id', 'tipe', 'kategori', 'grup_id', 'div', 'nama', 'deposit', 'bank_account_id', 'tgl_mulai', 'no_aset', 'keterangan', 'umur_ekonomis', 'harga_perolehan'],
    (data.asetRows || []).map(r => [
      r.id, r.tipe || '', r.kategori || '', r.grupId || null, r.div || '', r.nama, r.deposit || 0,
      r.bankAccountId || null, r.tglMulai || null, r.noAset || '', r.keterangan || '', r.umurEkonomis || 0, r.hargaPerolehan || 0
    ]))

  const depLog = []
  for (const r of data.asetRows || []) {
    for (const d of r.depresiasiLog || []) depLog.push([genId('adl'), r.id, d.periode, d.tanggal])
  }
  await insertMany('aset_depresiasi_log', ['id', 'aset_id', 'periode', 'tanggal'], depLog)

  // ---------- period_lock ----------
  if (data.periodLock) {
    await conn.query('REPLACE INTO period_lock (id, lock_ym) VALUES (1, ?)', [data.periodLock])
    console.log('  period_lock: 1 baris')
  }

  // ---------- row_colors: TIDAK ada di backup lama (disimpan terpisah di localStorage,
  // tidak pernah ikut ke-export). Warna baris gak bisa ikut kepindah otomatis — ini
  // batasan aplikasi lama, bukan bug migrasi. ----------

  await conn.commit()
} catch (err) {
  await conn.rollback()
  console.error('\n❌ Migrasi dibatalkan, tidak ada data yang tersimpan:')
  throw err
} finally {
  await conn.query('SET FOREIGN_KEY_CHECKS = 1')
  await conn.end()
}

console.log('')
console.log('✅ Migrasi selesai. Catatan: warna baris (row colors) tidak ikut pindah — itu memang tidak pernah tersimpan di file backup aplikasi lama.')

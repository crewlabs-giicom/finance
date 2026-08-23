#!/usr/bin/env node
/**
 * Pindahkan isi database MySQL `finance_app` (dipakai antara commit 491ea1b sampai
 * app ini balik ke SQLite) ke file SQLite yang baru.
 *
 * Cara pakai:
 *   npm run db:migrate                 # bikin data/finance.db + seluruh tabelnya
 *   npm run db:from-mysql              # pakai MYSQL_URL dari env/.env, atau default di bawah
 *   npm run db:from-mysql -- mysql://root:root@127.0.0.1:3306/finance_app
 *
 * Script ini INSERT-only ke tabel yang masih kosong. Jalankan --reset kalau mau
 * mengosongkan dulu tabel tujuan (termasuk `users`, karena akunnya ikut dipindah).
 */
import Database from 'better-sqlite3'
import mysql from 'mysql2/promise'
import { readFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const reset = args.includes('--reset')

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const mysqlUrl = args.find(a => a.startsWith('mysql://'))
  || process.env.MYSQL_URL
  || 'mysql://root:root@127.0.0.1:3306/finance_app'

const dbPath = process.env.DATABASE_PATH || './data/finance.db'
if (!existsSync(dbPath)) {
  console.error(`Database ${dbPath} belum ada. Jalankan "npm run db:migrate" dulu.`)
  process.exit(1)
}

// Induk dulu, baru anak — supaya foreign key tetap valid walau nanti dinyalakan lagi.
const TABLES_PARENT_FIRST = [
  'users',
  'bank_groups', 'bank_accounts', 'bank_balances', 'bank_txns',
  'mp_stores', 'mp_entries',
  'npwp_master', 'ppn_rows', 'ent_rows',
  'coa_master', 'avp_rows', 'avp_lawan',
  'te_gudang_rows', 'te_finance_rows',
  'aset_simple_master', 'aset_rows', 'aset_depresiasi_log',
  'dn_rows', 'tag_master', 'row_colors', 'period_lock',
  'deposito_rows', 'hutang_rows', 'bayar_rows'
]

/** MySQL mengembalikan DATETIME sebagai Date dan tinyint(1) sebagai number — SQLite cuma mau primitif. */
function toSqlite(v) {
  if (v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ')
  if (typeof v === 'boolean') return v ? 1 : 0
  if (Buffer.isBuffer(v)) return v.toString('utf-8')
  return v
}

const sqlite = new Database(dbPath)
const my = await mysql.createConnection({ uri: mysqlUrl })

console.log(`Dari MySQL  : ${mysqlUrl.replace(/:[^:@/]*@/, ':****@')}`)
console.log(`Ke SQLite   : ${dbPath}`)
console.log('')

sqlite.pragma('foreign_keys = OFF')
sqlite.exec('BEGIN')

const counts = []
try {
  if (reset) {
    for (const t of [...TABLES_PARENT_FIRST].reverse()) sqlite.exec(`DELETE FROM "${t}"`)
    console.log('  (--reset) seluruh tabel tujuan dikosongkan')
    console.log('')
  }

  for (const table of TABLES_PARENT_FIRST) {
    // Nama kolom diambil dari skema SQLite supaya urutan dan ejaannya pasti cocok.
    const cols = sqlite.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name)
    if (!cols.length) throw new Error(`Tabel "${table}" tidak ada di ${dbPath} — jalankan db:migrate dulu.`)

    const [rows] = await my.query(`SELECT ${cols.map(c => `\`${c}\``).join(', ')} FROM \`${table}\``)
    if (!rows.length) { console.log(`  ${table}: 0 baris`); counts.push([table, 0]); continue }

    const stmt = sqlite.prepare(
      `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
    )
    for (const r of rows) stmt.run(cols.map(c => toSqlite(r[c])))
    console.log(`  ${table}: ${rows.length} baris`)
    counts.push([table, rows.length])
  }

  sqlite.exec('COMMIT')
} catch (err) {
  sqlite.exec('ROLLBACK')
  console.error('\n❌ Dibatalkan, tidak ada data yang tersimpan di SQLite:')
  throw err
} finally {
  sqlite.pragma('foreign_keys = ON')
  await my.end()
}

// Verifikasi: jumlah baris di SQLite harus sama persis dengan yang dibaca dari MySQL.
console.log('')
let mismatch = 0
for (const [table, expected] of counts) {
  const { n } = sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get()
  if (n !== expected) { console.error(`  ⚠️  ${table}: MySQL ${expected} vs SQLite ${n}`); mismatch++ }
}
const fkErrors = sqlite.prepare('PRAGMA foreign_key_check').all()
if (fkErrors.length) console.error(`  ⚠️  ${fkErrors.length} pelanggaran foreign key (lihat PRAGMA foreign_key_check)`)
sqlite.close()

if (mismatch || fkErrors.length) process.exit(1)
console.log('✅ Semua tabel cocok jumlah barisnya dan foreign key bersih.')

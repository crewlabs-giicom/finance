#!/usr/bin/env node
/**
 * Import file Excel hasil "Export" List PM (satu sheet per grup) ke ppn_rows bertag "PM".
 *
 * Cara pakai:
 *   node scripts/import-list-pm.mjs <file.xlsx>           # dry-run, cuma laporan
 *   node scripts/import-list-pm.mjs <file.xlsx> --apply   # beneran nulis ke database
 *
 * - Nama sheet = nama grup (bank_groups.nama). "Tanpa Grup" -> groupId null.
 *   Grup yang belum ada dibuat otomatis (warna default).
 * - No. NPWP dicocokkan ke npwp_master; kalau belum ada, dibuat baru pakai Nama Penerbit.
 * - Kolom "Masa Kredit" di file export lama rusak (keluar "-23"), jadi diabaikan & dikosongkan.
 * - Baris kosong (tanpa No Bank, Keterangan, DPP) dilewati.
 * - Aman dijalankan ulang: baris yang sudah ada (grup+tanggal+no bank+keterangan+faktur+DPP+PPN
 *   sama) tidak di-insert lagi. Duplikat sah di dalam file tetap dihitung per jumlah.
 * - Sebelum --apply, database di-backup ke data/backup-before-import-pm-<timestamp>.db.
 */
import Database from 'better-sqlite3'
import XLSX from 'xlsx'
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const file = args.find(a => !a.startsWith('--'))
if (!file) {
  console.error('Pemakaian: node scripts/import-list-pm.mjs <file.xlsx> [--apply]')
  process.exit(1)
}

if (!process.env.DATABASE_PATH && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const dbPath = process.env.DATABASE_PATH || './data/finance.db'
if (!existsSync(dbPath)) { console.error(`Database ${dbPath} tidak ditemukan.`); process.exit(1) }

const genId = prefix => prefix + Date.now().toString(36) + randomBytes(5).toString('hex')
const pad = n => String(n).padStart(2, '0')

/** Sel tanggal: Date (dari cellDates) atau string "YYYY-MM-DD" apa adanya. */
function toDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    // Excel menyimpan tanggal tanpa zona; xlsx mengembalikan Date di zona lokal — ambil komponen lokal.
    // Geser +12 jam dulu supaya pembulatan detik/zona tidak menjatuhkan ke hari sebelumnya.
    const d = new Date(v.getTime() + 12 * 3600 * 1000)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const s = String(v).trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s
}
const toNum = v => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const n = Number(String(v).replace(/[^\d,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const str = v => (v == null ? '' : String(v).trim())

const wb = XLSX.readFile(file, { cellDates: true })
const conn = new Database(dbPath)

const groups = conn.prepare('SELECT id, nama FROM bank_groups').all()
const npwps = conn.prepare('SELECT id, no_npwp, nama_npwp FROM npwp_master').all()
const kategoris = new Set(conn.prepare('SELECT nama FROM pm_kategori_master').all().map(r => r.nama))
let maxGroupUrutan = conn.prepare('SELECT coalesce(max(urutan),0) m FROM bank_groups').get().m
let urutan = conn.prepare('SELECT coalesce(max(urutan),0) m FROM ppn_rows').get().m

const keyOf = r => [r.groupId || '', r.tanggal, r.code, r.description, r.noInvoice, r.dpp ?? '', r.ppn ?? ''].join('|')
const existingCount = new Map()
for (const r of conn.prepare(`SELECT group_id groupId, tanggal, code, description, no_invoice noInvoice, dpp, ppn
  FROM ppn_rows WHERE (',' || replace(tags,' ','') || ',') LIKE '%,PM,%'`).all()) {
  const k = keyOf({ ...r, code: r.code || '', description: r.description || '', noInvoice: r.noInvoice || '' })
  existingCount.set(k, (existingCount.get(k) || 0) + 1)
}

const newGroups = [], newNpwps = [], toInsert = [], warnings = []
let skippedEmpty = 0, skippedExisting = 0
const perSheet = {}

for (const sheetName of wb.SheetNames) {
  let groupId = null
  if (sheetName !== 'Tanpa Grup') {
    let g = groups.find(x => x.nama.trim().toLowerCase() === sheetName.trim().toLowerCase())
    if (!g) {
      g = { id: genId('g'), nama: sheetName, urutan: ++maxGroupUrutan }
      groups.push(g); newGroups.push(g)
    }
    groupId = g.id
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null })
  perSheet[sheetName] = 0
  for (const row of rows.slice(1)) {
    if (row[0] === 'TOTAL' || row.every(c => c == null || c === '')) continue
    const [, tgl, noBank, ket, noNpwp, nama, noFp, tglFp, dpp, ppn, , ketStatus] = row
    const r = {
      groupId,
      tanggal: toDate(tgl),
      code: str(noBank),
      description: str(ket),
      noInvoice: str(noFp),
      tanggalFp: toDate(tglFp),
      dpp: toNum(dpp),
      ppn: toNum(ppn)
    }
    if (!r.code && !r.description && r.dpp == null && r.ppn == null) { skippedEmpty++; continue }
    if (!r.tanggal) { warnings.push(`[${sheetName}] baris tanpa tanggal dilewati: ${r.code} ${r.description}`); continue }
    if (r.tanggalFp && !/^20\d{2}-/.test(r.tanggalFp)) warnings.push(`[${sheetName}] Tanggal FP aneh "${r.tanggalFp}" (${r.code} - ${r.description}) — diimport apa adanya, cek manual`)

    // NPWP
    let npwpId = null
    const no = str(noNpwp)
    if (no) {
      let n = npwps.find(x => x.no_npwp.trim() === no)
      if (!n) {
        n = { id: genId('npwp'), no_npwp: no, nama_npwp: str(nama) || no }
        npwps.push(n); newNpwps.push(n)
      }
      npwpId = n.id
    }

    // Keterangan: "Uncredited" atau nama kategori Credited
    const ks = str(ketStatus) || 'Uncredited'
    if (ks !== 'Uncredited' && !kategoris.has(ks)) warnings.push(`[${sheetName}] Keterangan "${ks}" belum ada di master kategori PM`)

    const k = keyOf(r)
    const ex = existingCount.get(k) || 0
    if (ex > 0) { existingCount.set(k, ex - 1); skippedExisting++; continue }

    toInsert.push({ ...r, npwpId, ketStatus: ks, urutan: ++urutan })
    perSheet[sheetName]++
  }
}

console.log(`Database : ${dbPath}`)
console.log(`File     : ${file}`)
console.log(`Akan diinsert per sheet:`, perSheet)
console.log(`Total insert: ${toInsert.length} | sudah ada (dilewati): ${skippedExisting} | baris kosong dilewati: ${skippedEmpty}`)
if (newGroups.length) console.log('Grup baru  :', newGroups.map(g => g.nama).join(', '))
if (newNpwps.length) console.log(`NPWP baru (${newNpwps.length}):`, newNpwps.map(n => `${n.no_npwp} ${n.nama_npwp}`).join('; '))
for (const w of warnings) console.log('PERINGATAN:', w)

if (!apply) { console.log('\nDry-run. Tambahkan --apply untuk menulis ke database.'); process.exit(0) }

const ts = new Date().toISOString().replace(/[:.]/g, '-')
const backup = dbPath.replace(/finance\.db$/, '') + `backup-before-import-pm-${ts}.db`
await conn.backup(backup)
console.log(`Backup   : ${backup}`)

conn.transaction(() => {
  const g = conn.prepare('INSERT INTO bank_groups (id, nama, warna, urutan) VALUES (?, ?, ?, ?)')
  for (const x of newGroups) g.run(x.id, x.nama, '#6C5CE7', x.urutan)
  const n = conn.prepare('INSERT INTO npwp_master (id, no_npwp, nama_npwp, nik, alamat) VALUES (?, ?, ?, \'\', \'\')')
  for (const x of newNpwps) n.run(x.id, x.no_npwp, x.nama_npwp)
  const p = conn.prepare(`INSERT INTO ppn_rows
    (id, group_id, tanggal, code, store, description, tags, debet, kredit, npwp_id, no_invoice, ppn, dpp,
     lampiran_faktur_pajak, masa_kredit, bentuk_jenis_biaya, tanggal_fp, ket_status, urutan)
    VALUES (?, ?, ?, ?, '', ?, 'PM', 0, 0, ?, ?, ?, ?, '', '', '', ?, ?, ?)`)
  for (const r of toInsert) {
    p.run(genId('ppn'), r.groupId, r.tanggal, r.code, r.description, r.npwpId, r.noInvoice, r.ppn, r.dpp,
      r.tanggalFp, r.ketStatus, r.urutan)
  }
})()
console.log('Selesai.')

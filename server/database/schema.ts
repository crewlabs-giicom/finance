import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ---------- Auth ----------
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('staff'), // 'admin' | 'staff'
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  // PIC yang dipakai buat preset filter PIC di Rekap Saldo waktu user ini login. Opsional.
  picId: text('pic_id').references(() => pics.id)
})

// ---------- Master Data: PIC (dipakai buat filter Rekap Saldo, opsional terhubung ke user login) ----------
export const pics = sqliteTable('pics', {
  id: text('id').primaryKey(),
  nama: text('nama').notNull(),
  urutan: integer('urutan').notNull().default(0)
})

// ---------- Master Data: Grup PT/Rekening (dipakai bareng banyak menu) ----------
export const bankGroups = sqliteTable('bank_groups', {
  id: text('id').primaryKey(),
  nama: text('nama').notNull(),
  warna: text('warna').default('#6C5CE7'),
  urutan: integer('urutan').notNull().default(0),
  // PIC penanggung jawab grup ini. Dipakai buat preset "Filter Grup" ke grup user itu waktu dia login.
  picId: text('pic_id').references(() => pics.id)
})

export const bankAccounts = sqliteTable('bank_accounts', {
  id: text('id').primaryKey(),
  groupId: text('group_id').references(() => bankGroups.id),
  picId: text('pic_id').references(() => pics.id),
  bankType: text('bank_type').notNull(), // 'BCA' | 'BRI' | ...
  namaRek: text('nama_rek').notNull(),
  noRek: text('no_rek').notNull(),
  // null = baseline belum ditentukan; diisi dari header "Saldo Awal" file CSV
  // waktu import, atau diturunkan dari transaksi tertua yang sudah punya saldo.
  saldoAwal: real('saldo_awal'),
  // Prefix format buat auto-generate kolom "No Bank" di Rincian Bank, mis. "BKCA/" ->
  // jadi "BKCA/2026/08/". Null/kosong = auto-generate dimatikan buat sisi itu.
  noBankFormatDebet: text('no_bank_format_debet'),
  noBankFormatKredit: text('no_bank_format_kredit')
})

// ---------- Rekap Saldo: Saldo Rekening Bank (mirrors original app's `bank[]` array) ----------
export const bankBalances = sqliteTable('bank_balances', {
  id: text('id').primaryKey(),
  pic: text('pic').references(() => pics.id), // FK to pics.id (nullable = "Tanpa PIC")
  rek: text('rek').notNull().default(''),
  saldo: real('saldo').notNull().default(0),
  bisaDipakai: real('bisa_dipakai'),
  ket: text('ket').default(''),
  grup: text('grup').references(() => bankGroups.id), // FK to bank_groups.id (nullable = "Tanpa Grup")
  // Gembok per baris — kalau true, kolom Saldo baris ini gak bisa diedit (termasuk lewat Nol-in Semua Saldo).
  locked: integer('locked', { mode: 'boolean' }).notNull().default(false)
})

// ---------- Rincian Bank ----------
export const bankTxns = sqliteTable('bank_txns', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => bankAccounts.id),
  tanggal: text('tanggal').notNull(), // ISO YYYY-MM-DD
  transaksi: text('transaksi').notNull(),
  cabang: text('cabang').default(''),
  debet: real('debet').notNull().default(0),
  kredit: real('kredit').notNull().default(0),
  saldo: real('saldo').notNull().default(0),
  bankType: text('bank_type').default(''),
  noBankManual: text('no_bank_manual').default(''),
  ketTransaksiManual: text('ket_transaksi_manual'),
  tag: text('tag').default(''),
  noteManual: text('note_manual'),
  checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
  manual: integer('manual', { mode: 'boolean' }).notNull().default(false),
  // Referensi internal buat dedup import (mis. Journal No. BNI) — bukan field yang
  // ditampilkan/diisi user, beda dari noBankManual (kolom "No Bank" yang keliatan di UI).
  importRef: text('import_ref'),
  // Tie-breaker urutan tampilan buat transaksi yang tanggalnya sama — baris baru
  // (manual/import) selalu dapet nilai paling besar (nongol paling bawah di
  // tanggal itu), baris hasil Duplicate disisipin di antara urutan sumber dan
  // baris berikutnya (fractional indexing) biar nongol PERSIS di bawahnya.
  urutan: real('urutan')
})

// ---------- Rincian MP (marketplace toko per grup) ----------
export const mpStores = sqliteTable('mp_stores', {
  id: text('id').primaryKey(),
  groupId: text('group_id').references(() => bankGroups.id),
  nama: text('nama').notNull(),
  platform: text('platform').default(''),
  saldoAwal: real('saldo_awal').notNull().default(0)
})

// One row per (store, tanggal) — mirrors the original app's mpRows[].vals[storeId] = {d, k}
export const mpEntries = sqliteTable('mp_entries', {
  id: text('id').primaryKey(),
  storeId: text('store_id').notNull().references(() => mpStores.id),
  tanggal: text('tanggal').notNull(),
  debet: real('debet').notNull().default(0),
  kredit: real('kredit').notNull().default(0)
}, (t) => ({
  storeDateIdx: uniqueIndex('mp_entries_store_date_idx').on(t.storeId, t.tanggal)
}))

// ---------- List Pajak ----------
export const npwpMaster = sqliteTable('npwp_master', {
  id: text('id').primaryKey(),
  noNpwp: text('no_npwp').notNull(),
  namaNpwp: text('nama_npwp').notNull(),
  nik: text('nik').default(''),
  alamat: text('alamat').default('')
})

export const ppnRows = sqliteTable('ppn_rows', {
  id: text('id').primaryKey(),
  sourceTxnId: text('source_txn_id').references(() => bankTxns.id),
  groupId: text('group_id').references(() => bankGroups.id),
  tanggal: text('tanggal').notNull(),
  code: text('code').default(''),
  store: text('store').default(''),
  description: text('description'),
  tags: text('tags').default(''),
  debet: real('debet').notNull().default(0),
  kredit: real('kredit').notNull().default(0),
  note: text('note'),
  npwpId: text('npwp_id').references(() => npwpMaster.id),
  noInvoice: text('no_invoice').default(''),
  netDibayarkan: real('net_dibayarkan'),
  ppn: real('ppn'),
  dpp: real('dpp'),
  pph23: real('pph23'),
  pph23_4a2: real('pph23_4a2'),
  pph21bp: real('pph21bp'),
  lampiranFakturPajak: text('lampiran_faktur_pajak').default(''),
  masaKredit: text('masa_kredit').default(''), // 'YYYY-MM'
  bentukJenisBiaya: text('bentuk_jenis_biaya').default('')
})

// ---------- Entertainment ----------
export const entRows = sqliteTable('ent_rows', {
  id: text('id').primaryKey(),
  sourceTxnId: text('source_txn_id').references(() => bankTxns.id),
  groupId: text('group_id').references(() => bankGroups.id),
  tanggal: text('tanggal').notNull(),
  place: text('place').default(''),
  alamat: text('alamat').default(''),
  description: text('description'),
  jenis: text('jenis').default(''),
  amount: real('amount').notNull().default(0),
  clientName: text('client_name').default(''),
  posisi: text('posisi').default(''),
  company: text('company').default(''),
  jenisUsaha: text('jenis_usaha').default(''),
  note: text('note')
})

// ---------- Aktiva - Pasiva ----------
export const coaMaster = sqliteTable('coa_master', {
  id: text('id').primaryKey(),
  noCoa: text('no_coa').notNull(),
  namaCoa: text('nama_coa').notNull()
})

export const avpRows = sqliteTable('avp_rows', {
  id: text('id').primaryKey(),
  coaId: text('coa_id').references(() => coaMaster.id),
  groupId: text('group_id').references(() => bankGroups.id),
  tanggal: text('tanggal').notNull(),
  code: text('code').default(''),
  store: text('store').default(''),
  description: text('description'),
  tags: text('tags').default(''),
  debet: real('debet').notNull().default(0),
  kredit: real('kredit').notNull().default(0)
})

export const avpLawan = sqliteTable('avp_lawan', {
  id: text('id').primaryKey(),
  rowId: text('row_id').notNull().references(() => avpRows.id),
  partnerId: text('partner_id').notNull().references(() => avpRows.id)
})

// ---------- Tagihan Ekspedisi ----------
export const teGudangRows = sqliteTable('te_gudang_rows', {
  id: text('id').primaryKey(),
  tanggal: text('tanggal'),
  namaPengirim: text('nama_pengirim').default(''),
  namaPenerima: text('nama_penerima').default(''),
  invGii: text('inv_gii').default(''),
  noWaybill: text('no_waybill').notNull(),
  biaya: real('biaya').notNull().default(0),
  keperluan: text('keperluan').default('')
})

export const teFinanceRows = sqliteTable('te_finance_rows', {
  id: text('id').primaryKey(),
  tanggal: text('tanggal'),
  noWaybill: text('no_waybill').notNull(),
  biaya: real('biaya').notNull().default(0),
  namaPenerima: text('nama_penerima').default(''),
  keterangan: text('keterangan').default('')
})

// ---------- Aset ----------
export const asetSimpleMaster = sqliteTable('aset_simple_master', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'tipe' | 'kategori' | 'div'
  value: text('value').notNull()
})

export const asetRows = sqliteTable('aset_rows', {
  id: text('id').primaryKey(),
  tipe: text('tipe').default(''),
  kategori: text('kategori').default(''),
  grupId: text('grup_id').references(() => bankGroups.id),
  div: text('div').default(''),
  nama: text('nama').notNull(),
  deposit: real('deposit').notNull().default(0),
  bankAccountId: text('bank_account_id').references(() => bankAccounts.id),
  tglMulai: text('tgl_mulai'),
  noAset: text('no_aset').default(''),
  keterangan: text('keterangan').default(''),
  umurEkonomis: real('umur_ekonomis').notNull().default(0),
  hargaPerolehan: real('harga_perolehan').notNull().default(0)
})

export const asetDepresiasiLog = sqliteTable('aset_depresiasi_log', {
  id: text('id').primaryKey(),
  asetId: text('aset_id').notNull().references(() => asetRows.id),
  periode: text('periode').notNull(), // 'YYYY-MM'
  tanggal: text('tanggal').notNull()
})

// ---------- Daftar Norminatif (stub, dilengkapi di fase berikutnya) ----------
export const dnRows = sqliteTable('dn_rows', {
  id: text('id').primaryKey(),
  tanggal: text('tanggal'),
  description: text('description'),
  amount: real('amount').notNull().default(0),
  npwpId: text('npwp_id').references(() => npwpMaster.id)
})

// ---------- Tag master (Rincian Bank <-> List Pajak/Entertainment) ----------
export const tagMaster = sqliteTable('tag_master', {
  id: text('id').primaryKey(),
  nama: text('nama').notNull().unique()
})

// ---------- Row colors (klik kanan warnain baris) ----------
export const rowColors = sqliteTable('row_colors', {
  id: text('id').primaryKey(),
  entityKind: text('entity_kind').notNull(), // 'bank' | 'deposito' | 'hutang' | 'bayar' | 'rbtxn' | 'ppn' | 'ent' | 'avp'
  entityId: text('entity_id').notNull(),
  color: text('color').notNull()
}, (t) => ({
  uniqEntity: uniqueIndex('row_colors_entity_unique').on(t.entityKind, t.entityId)
}))

// ---------- Period Lock (single row config) ----------
export const periodLock = sqliteTable('period_lock', {
  id: integer('id').primaryKey().default(1),
  lockYm: text('lock_ym') // 'YYYY-MM' | null
})

// ---------- Rekap Saldo: Deposito / Hutang / Bayar panels ----------
export const depositoRows = sqliteTable('deposito_rows', {
  id: text('id').primaryKey(),
  nama: text('nama').default(''),
  nominal: real('nominal').notNull().default(0),
  tglMasuk: text('tgl_masuk'),
  rate: text('rate').default(''),
  jatuhTempo: text('jatuh_tempo'),
  ket: text('ket').default('')
})

export const hutangRows = sqliteTable('hutang_rows', {
  id: text('id').primaryKey(),
  peminjam: text('peminjam').default(''),
  kreditur: text('kreditur').default(''),
  nominal: real('nominal').notNull().default(0),
  rate: text('rate').default(''),
  tglPinjam: text('tgl_pinjam'),
  jatuhTempo: text('jatuh_tempo'),
  ket: text('ket').default('')
})

export const bayarRows = sqliteTable('bayar_rows', {
  id: text('id').primaryKey(),
  pt: text('pt').default(''),
  groupId: text('group_id').references(() => bankGroups.id),
  nominal: real('nominal').notNull().default(0),
  tglBayar: text('tgl_bayar'),
  tglPesan: text('tgl_pesan'),
  noCtr: text('no_ctr').default(''),
  payIam: text('pay_iam').default(''),
  payEkspds: text('pay_ekspds').default(''),
  ket: text('ket').default('')
})

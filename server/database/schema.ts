import { mysqlTable, varchar, text, int, double, boolean, timestamp, uniqueIndex } from 'drizzle-orm/mysql-core'

// Panjang kolom kunci: id/FK pakai 64, karena genId() menghasilkan string pendek (prefix + base36 + hex).
const ID = { length: 64 } as const

// ---------- Auth ----------
export const users = mysqlTable('users', {
  id: varchar('id', ID).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 32 }).notNull().default('staff'), // 'admin' | 'staff'
  createdAt: timestamp('created_at').notNull().defaultNow()
})

// ---------- Master Data: Grup PT/Rekening (dipakai bareng banyak menu) ----------
export const bankGroups = mysqlTable('bank_groups', {
  id: varchar('id', ID).primaryKey(),
  nama: varchar('nama', { length: 255 }).notNull(),
  warna: varchar('warna', { length: 32 }).default('#6C5CE7')
})

export const bankAccounts = mysqlTable('bank_accounts', {
  id: varchar('id', ID).primaryKey(),
  groupId: varchar('group_id', ID).references(() => bankGroups.id),
  bankType: varchar('bank_type', { length: 32 }).notNull(), // 'BCA' | 'BRI' | ...
  namaRek: varchar('nama_rek', { length: 255 }).notNull(),
  noRek: varchar('no_rek', { length: 64 }).notNull(),
  // null = baseline belum ditentukan; diisi dari header "Saldo Awal" file CSV
  // waktu import, atau diturunkan dari transaksi tertua yang sudah punya saldo.
  saldoAwal: double('saldo_awal')
})

// ---------- Rekap Saldo: Saldo Rekening Bank (mirrors original app's `bank[]` array) ----------
export const bankBalances = mysqlTable('bank_balances', {
  id: varchar('id', ID).primaryKey(),
  pic: varchar('pic', { length: 255 }).default(''),
  rek: varchar('rek', { length: 255 }).notNull().default(''),
  saldo: double('saldo').notNull().default(0),
  bisaDipakai: double('bisa_dipakai'),
  ket: varchar('ket', { length: 500 }).default(''),
  grup: varchar('grup', ID).references(() => bankGroups.id) // FK to bank_groups.id (nullable = "Tanpa Grup")
})

// ---------- Rincian Bank ----------
export const bankTxns = mysqlTable('bank_txns', {
  id: varchar('id', ID).primaryKey(),
  accountId: varchar('account_id', ID).notNull().references(() => bankAccounts.id),
  tanggal: varchar('tanggal', { length: 10 }).notNull(), // ISO YYYY-MM-DD
  transaksi: text('transaksi').notNull(),
  cabang: varchar('cabang', { length: 255 }).default(''),
  debet: double('debet').notNull().default(0),
  kredit: double('kredit').notNull().default(0),
  saldo: double('saldo').notNull().default(0),
  bankType: varchar('bank_type', { length: 32 }).default(''),
  noBankManual: varchar('no_bank_manual', { length: 255 }).default(''),
  ketTransaksiManual: text('ket_transaksi_manual'),
  tag: varchar('tag', { length: 255 }).default(''),
  noteManual: text('note_manual'),
  checked: boolean('checked').notNull().default(false),
  manual: boolean('manual').notNull().default(false)
})

// ---------- Rincian MP (marketplace toko per grup) ----------
export const mpStores = mysqlTable('mp_stores', {
  id: varchar('id', ID).primaryKey(),
  groupId: varchar('group_id', ID).references(() => bankGroups.id),
  nama: varchar('nama', { length: 255 }).notNull(),
  platform: varchar('platform', { length: 64 }).default(''),
  saldoAwal: double('saldo_awal').notNull().default(0)
})

// One row per (store, tanggal) — mirrors the original app's mpRows[].vals[storeId] = {d, k}
export const mpEntries = mysqlTable('mp_entries', {
  id: varchar('id', ID).primaryKey(),
  storeId: varchar('store_id', ID).notNull().references(() => mpStores.id),
  tanggal: varchar('tanggal', { length: 10 }).notNull(),
  debet: double('debet').notNull().default(0),
  kredit: double('kredit').notNull().default(0)
}, (t) => ({
  storeDateIdx: uniqueIndex('mp_entries_store_date_idx').on(t.storeId, t.tanggal)
}))

// ---------- List Pajak ----------
export const npwpMaster = mysqlTable('npwp_master', {
  id: varchar('id', ID).primaryKey(),
  noNpwp: varchar('no_npwp', { length: 64 }).notNull(),
  namaNpwp: varchar('nama_npwp', { length: 255 }).notNull(),
  nik: varchar('nik', { length: 64 }).default(''),
  alamat: varchar('alamat', { length: 500 }).default('')
})

export const ppnRows = mysqlTable('ppn_rows', {
  id: varchar('id', ID).primaryKey(),
  sourceTxnId: varchar('source_txn_id', ID).references(() => bankTxns.id),
  groupId: varchar('group_id', ID).references(() => bankGroups.id),
  tanggal: varchar('tanggal', { length: 10 }).notNull(),
  code: varchar('code', { length: 255 }).default(''),
  store: varchar('store', { length: 255 }).default(''),
  description: text('description'),
  tags: varchar('tags', { length: 255 }).default(''),
  debet: double('debet').notNull().default(0),
  kredit: double('kredit').notNull().default(0),
  note: text('note'),
  npwpId: varchar('npwp_id', ID).references(() => npwpMaster.id),
  noInvoice: varchar('no_invoice', { length: 255 }).default(''),
  netDibayarkan: double('net_dibayarkan'),
  ppn: double('ppn'),
  dpp: double('dpp'),
  pph23: double('pph23'),
  pph23_4a2: double('pph23_4a2'),
  pph21bp: double('pph21bp'),
  lampiranFakturPajak: varchar('lampiran_faktur_pajak', { length: 255 }).default(''),
  masaKredit: varchar('masa_kredit', { length: 7 }).default(''), // 'YYYY-MM'
  bentukJenisBiaya: varchar('bentuk_jenis_biaya', { length: 255 }).default('')
})

// ---------- Entertainment ----------
export const entRows = mysqlTable('ent_rows', {
  id: varchar('id', ID).primaryKey(),
  sourceTxnId: varchar('source_txn_id', ID).references(() => bankTxns.id),
  groupId: varchar('group_id', ID).references(() => bankGroups.id),
  tanggal: varchar('tanggal', { length: 10 }).notNull(),
  place: varchar('place', { length: 255 }).default(''),
  alamat: varchar('alamat', { length: 500 }).default(''),
  description: text('description'),
  jenis: varchar('jenis', { length: 255 }).default(''),
  amount: double('amount').notNull().default(0),
  clientName: varchar('client_name', { length: 255 }).default(''),
  posisi: varchar('posisi', { length: 255 }).default(''),
  company: varchar('company', { length: 255 }).default(''),
  jenisUsaha: varchar('jenis_usaha', { length: 255 }).default(''),
  note: text('note')
})

// ---------- Aktiva - Pasiva ----------
export const coaMaster = mysqlTable('coa_master', {
  id: varchar('id', ID).primaryKey(),
  noCoa: varchar('no_coa', { length: 64 }).notNull(),
  namaCoa: varchar('nama_coa', { length: 255 }).notNull()
})

export const avpRows = mysqlTable('avp_rows', {
  id: varchar('id', ID).primaryKey(),
  coaId: varchar('coa_id', ID).references(() => coaMaster.id),
  groupId: varchar('group_id', ID).references(() => bankGroups.id),
  tanggal: varchar('tanggal', { length: 10 }).notNull(),
  code: varchar('code', { length: 255 }).default(''),
  store: varchar('store', { length: 255 }).default(''),
  description: text('description'),
  tags: varchar('tags', { length: 255 }).default(''),
  debet: double('debet').notNull().default(0),
  kredit: double('kredit').notNull().default(0)
})

export const avpLawan = mysqlTable('avp_lawan', {
  id: varchar('id', ID).primaryKey(),
  rowId: varchar('row_id', ID).notNull().references(() => avpRows.id),
  partnerId: varchar('partner_id', ID).notNull().references(() => avpRows.id)
})

// ---------- Tagihan Ekspedisi ----------
export const teGudangRows = mysqlTable('te_gudang_rows', {
  id: varchar('id', ID).primaryKey(),
  tanggal: varchar('tanggal', { length: 10 }),
  namaPengirim: varchar('nama_pengirim', { length: 255 }).default(''),
  namaPenerima: varchar('nama_penerima', { length: 255 }).default(''),
  invGii: varchar('inv_gii', { length: 255 }).default(''),
  noWaybill: varchar('no_waybill', { length: 128 }).notNull(),
  biaya: double('biaya').notNull().default(0),
  keperluan: varchar('keperluan', { length: 500 }).default('')
})

export const teFinanceRows = mysqlTable('te_finance_rows', {
  id: varchar('id', ID).primaryKey(),
  tanggal: varchar('tanggal', { length: 10 }),
  noWaybill: varchar('no_waybill', { length: 128 }).notNull(),
  biaya: double('biaya').notNull().default(0),
  namaPenerima: varchar('nama_penerima', { length: 255 }).default(''),
  keterangan: varchar('keterangan', { length: 500 }).default('')
})

// ---------- Aset ----------
export const asetSimpleMaster = mysqlTable('aset_simple_master', {
  id: varchar('id', ID).primaryKey(),
  kind: varchar('kind', { length: 32 }).notNull(), // 'tipe' | 'kategori' | 'div'
  value: varchar('value', { length: 255 }).notNull()
})

export const asetRows = mysqlTable('aset_rows', {
  id: varchar('id', ID).primaryKey(),
  tipe: varchar('tipe', { length: 255 }).default(''),
  kategori: varchar('kategori', { length: 255 }).default(''),
  grupId: varchar('grup_id', ID).references(() => bankGroups.id),
  div: varchar('div', { length: 255 }).default(''),
  nama: varchar('nama', { length: 255 }).notNull(),
  deposit: double('deposit').notNull().default(0),
  bankAccountId: varchar('bank_account_id', ID).references(() => bankAccounts.id),
  tglMulai: varchar('tgl_mulai', { length: 10 }),
  noAset: varchar('no_aset', { length: 255 }).default(''),
  keterangan: varchar('keterangan', { length: 500 }).default(''),
  umurEkonomis: double('umur_ekonomis').notNull().default(0),
  hargaPerolehan: double('harga_perolehan').notNull().default(0)
})

export const asetDepresiasiLog = mysqlTable('aset_depresiasi_log', {
  id: varchar('id', ID).primaryKey(),
  asetId: varchar('aset_id', ID).notNull().references(() => asetRows.id),
  periode: varchar('periode', { length: 7 }).notNull(), // 'YYYY-MM'
  tanggal: varchar('tanggal', { length: 10 }).notNull()
})

// ---------- Daftar Norminatif (stub, dilengkapi di fase berikutnya) ----------
export const dnRows = mysqlTable('dn_rows', {
  id: varchar('id', ID).primaryKey(),
  tanggal: varchar('tanggal', { length: 10 }),
  description: text('description'),
  amount: double('amount').notNull().default(0),
  npwpId: varchar('npwp_id', ID).references(() => npwpMaster.id)
})

// ---------- Tag master (Rincian Bank <-> List Pajak/Entertainment) ----------
export const tagMaster = mysqlTable('tag_master', {
  id: varchar('id', ID).primaryKey(),
  nama: varchar('nama', { length: 191 }).notNull().unique()
})

// ---------- Row colors (klik kanan warnain baris) ----------
export const rowColors = mysqlTable('row_colors', {
  id: varchar('id', ID).primaryKey(),
  entityKind: varchar('entity_kind', { length: 32 }).notNull(), // 'bank' | 'deposito' | 'hutang' | 'bayar' | 'rbtxn' | 'ppn' | 'ent' | 'avp'
  entityId: varchar('entity_id', { length: 128 }).notNull(),
  color: varchar('color', { length: 32 }).notNull()
}, (t) => ({
  uniqEntity: uniqueIndex('row_colors_entity_unique').on(t.entityKind, t.entityId)
}))

// ---------- Period Lock (single row config) ----------
export const periodLock = mysqlTable('period_lock', {
  id: int('id').primaryKey().default(1),
  lockYm: varchar('lock_ym', { length: 7 }) // 'YYYY-MM' | null
})

// ---------- Rekap Saldo: Deposito / Hutang / Bayar panels ----------
export const depositoRows = mysqlTable('deposito_rows', {
  id: varchar('id', ID).primaryKey(),
  nama: varchar('nama', { length: 255 }).default(''),
  nominal: double('nominal').notNull().default(0),
  tglMasuk: varchar('tgl_masuk', { length: 10 }),
  rate: varchar('rate', { length: 64 }).default(''),
  jatuhTempo: varchar('jatuh_tempo', { length: 10 }),
  ket: varchar('ket', { length: 500 }).default('')
})

export const hutangRows = mysqlTable('hutang_rows', {
  id: varchar('id', ID).primaryKey(),
  peminjam: varchar('peminjam', { length: 255 }).default(''),
  kreditur: varchar('kreditur', { length: 255 }).default(''),
  nominal: double('nominal').notNull().default(0),
  rate: varchar('rate', { length: 64 }).default(''),
  tglPinjam: varchar('tgl_pinjam', { length: 10 }),
  jatuhTempo: varchar('jatuh_tempo', { length: 10 }),
  ket: varchar('ket', { length: 500 }).default('')
})

export const bayarRows = mysqlTable('bayar_rows', {
  id: varchar('id', ID).primaryKey(),
  pt: varchar('pt', { length: 255 }).default(''),
  nominal: double('nominal').notNull().default(0),
  tglBayar: varchar('tgl_bayar', { length: 10 }),
  tglPesan: varchar('tgl_pesan', { length: 10 }),
  noCtr: varchar('no_ctr', { length: 255 }).default(''),
  payIam: varchar('pay_iam', { length: 255 }).default(''),
  payEkspds: varchar('pay_ekspds', { length: 255 }).default(''),
  ket: varchar('ket', { length: 500 }).default('')
})

# Finance System

Aplikasi finance internal — hasil port dari aplikasi HTML satu file (`legacy/rekap-saldo-mp_4(3).html`)
ke Nuxt 4 + SQLite, supaya bisa dipakai banyak orang dan datanya tersimpan terpusat.

Stack: Nuxt 4 (SSR) · Drizzle ORM · SQLite (better-sqlite3) · nuxt-auth-utils.

## Dokumentasi

| Dokumen | Untuk siapa |
|---|---|
| [docs/GIT-DASAR.md](docs/GIT-DASAR.md) | Yang belum terbiasa Git — pull, commit, push saja |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Yang mengurus rilis ke server |

## Modul

| Menu | Ringkasan |
|---|---|
| Rekap Saldo | Saldo rekening per grup + panel Deposito, Hutang, Bayar. Export Excel & screenshot laporan. |
| Rincian MP | Grid mutasi harian per toko marketplace, saldo berjalan nyambung lintas bulan. |
| Rincian Bank | Mutasi per rekening + import CSV BCA/BRI, tag, warna baris, duplicate. |
| List Pajak | Data PPn; kolom PPh terisi otomatis dari Tag, plus ringkasan Masa Kredit. |
| Entertainment | Catatan entertainment & relasi usaha, bisa ditarik dari transaksi bank. |
| Aktiva - Pasiva | Import per COA, pencocokan pasangan debit-kredit (lawan) many-to-many. |
| Daftar Norminatif | Tampilan turunan List Pajak untuk baris ber-Tag PPh 23 / 21 BP. |
| Tagihan Ekspedisi | Pencocokan data Gudang vs tagihan Finance lewat No. Waybill. |
| Aset | Daftar aset + depresiasi bulanan (idempoten per periode). |
| Master Data | Grup, rekening, tag, NPWP, COA, master aset, dan kunci periode. |

## Setup lokal

```bash
cp .env.example .env          # isi DATABASE_PATH & NUXT_SESSION_PASSWORD
npm install
npm run db:migrate            # buat 25 tabel
npm run dev
```

Butuh **Node 20, 22, atau 24** (bukan rilis ganjil).

Seluruh database ada di satu file (`data/finance.db` secara default). Backup = copy file itu
(beserta `-wal`/`-shm` kalau ada, atau jalankan `VACUUM INTO` saat app mati).

User pertama yang mendaftar di `/register` otomatis jadi admin.

### Import data dari aplikasi HTML lama

Ekspor backup lewat tombol "Export Backup" di aplikasi lama, lalu:

```bash
npm run db:import -- legacy/backup-xxx.json
```

Tambahkan `--reset` untuk mengosongkan seluruh tabel data lebih dulu (tabel `users` tidak disentuh).
Warna baris tidak ikut pindah — data itu memang tidak pernah masuk file backup aplikasi lama.

## Deploy ke cPanel

Panduan lengkapnya — dari setup repo, deploy key, sampai rutinitas push harian —
ada di **[docs/DEPLOY.md](docs/DEPLOY.md)**.

Ringkasnya: source di-build di `~/js_app/finance`, hasil `.output/` disalin ke
`~/public_html/finance` yang didaftarkan di Setup Node.js App. Sekali deploy cukup:

```bash
bash ~/js_app/finance/scripts/deploy.sh
```

Environment variables yang wajib diisi di Setup Node.js App:

| Variable | Nilai |
|---|---|
| `DATABASE_PATH` | absolute path di luar `public_html`, mis. `/home/USER/finance-data/finance.db` |
| `NUXT_SESSION_PASSWORD` | string acak minimal 32 karakter |
| `NODE_ENV` | `production` |

### Catatan penting soal file database

- **Taruh di luar document root.** Kalau file `.db` bisa diakses lewat URL, seluruh data
  bisa diunduh siapa saja. Selalu set `DATABASE_PATH` ke absolute path — path relatif
  akan menghasilkan dua database berbeda, karena build dan runtime jalan dari
  working directory yang berbeda.
- **Direktori-nya harus writable**, bukan cuma file-nya: mode WAL bikin file pendamping
  `finance.db-wal` dan `finance.db-shm` di direktori yang sama.
- **`better-sqlite3` itu native module**, tapi prebuilt binary-nya (`linux-x64.node` dll)
  sudah ikut ter-bundle ke dalam `.output/server/node_modules/`, jadi tidak perlu
  compiler `node-gyp` maupun `npm install` di folder yang di-serve.

## Catatan teknis

- **Kunci periode** ditegakkan di server ([server/utils/periodLock.ts](server/utils/periodLock.ts)),
  bukan hanya di UI — berlaku untuk semua pengguna dan semua endpoint.
- **CRUD** sepuluh modul dibangun dari satu pabrik handler
  ([server/utils/crud.ts](server/utils/crud.ts)), dideklarasikan di
  [server/utils/tables.ts](server/utils/tables.ts).
- **Parsing CSV bank** dikerjakan di server ([server/utils/bankCsv.ts](server/utils/bankCsv.ts)),
  termasuk dedup dan hitung ulang saldo berjalan.
- **SheetJS & html2canvas** di-import dinamis dan hanya di browser, agar tidak masuk bundle SSR.
- Nilai rupiah disimpan sebagai `real` (float 64-bit). Rupiah selalu bilangan bulat dan mantissa 53-bit
  jauh melampaui nominal apa pun yang dipakai di sini, jadi tidak ada pembulatan yang hilang.

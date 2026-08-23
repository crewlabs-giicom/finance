# Finance System

Aplikasi finance internal — hasil port dari aplikasi HTML satu file (`legacy/rekap-saldo-mp_4(3).html`)
ke Nuxt 4 + SQLite, supaya bisa dipakai banyak orang dan datanya tersimpan terpusat.

Stack: Nuxt 4 (SSR) · Drizzle ORM · SQLite (better-sqlite3) · nuxt-auth-utils.

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

## Deploy ke cPanel (sekali klik lewat Git)

Setelah setup awal, tiap rilis cukup: `git push`, lalu klik **Deploy HEAD Commit**
di cPanel. Sisanya ([.cpanel.yml](.cpanel.yml) → [scripts/deploy.sh](scripts/deploy.sh))
otomatis: `npm ci` → `npm run build` → `npm run db:migrate` → restart Passenger.

### Setup awal (sekali saja)

1. cPanel → **Setup Node.js App** → Create Application:
   - Node version: 20, 22, atau 24
   - Application root: folder di luar `public_html`, mis. `finance-app`
   - Application startup file: `app.js`

   Ini juga yang membuat virtualenv di `~/nodevenv/finance-app/<versi>/`, yang nanti
   dicari otomatis oleh `deploy.sh`.

2. Environment variables di panel yang sama:
   - `DATABASE_PATH` = absolute path ke file DB, mis. `/home/USER/finance-data/finance.db`
   - `NUXT_SESSION_PASSWORD` = string acak minimal 32 karakter
   - `NODE_ENV` = `production`

3. cPanel → **Git Version Control** → Create:
   - Clone URL: URL repo ini
   - Repository Path: **sama persis** dengan Application Root di langkah 1
     (jadi hasil clone langsung jadi aplikasinya, tidak perlu copy file)

   Repo private butuh kunci SSH: buat di cPanel → SSH Access, lalu daftarkan
   public key-nya sebagai Deploy Key di GitHub, dan pakai clone URL bentuk SSH.

4. Buka tab **Pull or Deploy** → **Deploy HEAD Commit**. Deploy pertama paling lama
   karena `npm ci` mengunduh semua dependency dari nol.

5. Kalau memigrasi data lama, sekali saja lewat Terminal cPanel:

   ```bash
   source ~/nodevenv/finance-app/22/bin/activate
   cd ~/finance-app
   npm run db:import -- legacy/backup-xxx.json
   ```

### Rilis berikutnya

```bash
git push origin master
```

lalu di cPanel → Git Version Control → **Pull or Deploy** → **Update from Remote**
→ **Deploy HEAD Commit**.

Log hasil deploy ada di `~/.cpanel/logs/` — cek di situ kalau ada yang gagal.

Mau tanpa klik sama sekali? Tambahkan GitHub Actions yang SSH ke server lalu
menjalankan `bash ~/finance-app/scripts/deploy.sh` — script yang sama, jadi tidak
ada logika yang bercabang.

### Kalau build kena limit hosting

`nuxt build` adalah langkah paling berat di sini. Di shared hosting yang ketat,
prosesnya bisa kena OOM-kill (deploy berhenti tanpa error jelas). `deploy.sh` sudah
membatasi heap ke 1536 MB; kalau masih gagal, turunkan lewat env var `NODE_OPTIONS`,
atau pindahkan build ke GitHub Actions dan kirim folder `.output/` hasil build ke
server lewat rsync — server tinggal `npm run db:migrate` + `touch tmp/restart.txt`.

### Catatan penting soal file database

- **Taruh di luar document root.** Kalau file `.db` bisa diakses lewat URL, seluruh data
  bisa diunduh siapa saja. Selalu set `DATABASE_PATH` ke absolute path — jangan andalkan
  default relatif, karena cwd Passenger belum tentu root aplikasi.
- **Direktori-nya harus writable**, bukan cuma file-nya: mode WAL bikin file pendamping
  `finance.db-wal` dan `finance.db-shm` di direktori yang sama.
- **`better-sqlite3` itu native module**, tapi paketnya sudah membawa prebuilt binary
  (`prebuilds/linux-x64.node` dll) untuk semua platform, jadi `npm ci` di cPanel tidak
  perlu compiler `node-gyp`. Kalau suatu saat gagal load, jalankan `npm rebuild better-sqlite3`
  dengan versi Node yang sama seperti yang dipakai Passenger.

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

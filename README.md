# Finance System

Aplikasi finance internal — hasil port dari aplikasi HTML satu file (`legacy/rekap-saldo-mp_4(3).html`)
ke Nuxt 4 + MySQL, supaya bisa dipakai banyak orang dan datanya tersimpan terpusat.

Stack: Nuxt 4 (SSR) · Drizzle ORM · MySQL 8 · nuxt-auth-utils.

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
cp .env.example .env          # isi DATABASE_URL & NUXT_SESSION_PASSWORD
npm install
npm run db:migrate            # buat 25 tabel
npm run dev
```

Butuh **Node 20 atau 22** (bukan rilis ganjil) dan MySQL 8.

User pertama yang mendaftar di `/register` otomatis jadi admin.

### Import data dari aplikasi HTML lama

Ekspor backup lewat tombol "Export Backup" di aplikasi lama, lalu:

```bash
npm run db:import -- legacy/backup-xxx.json
```

Tambahkan `--reset` untuk mengosongkan seluruh tabel data lebih dulu (tabel `users` tidak disentuh).
Warna baris tidak ikut pindah — data itu memang tidak pernah masuk file backup aplikasi lama.

## Deploy ke cPanel (Setup Node.js App)

1. cPanel → **MySQL Databases**: buat database + user, catat kredensialnya.
2. cPanel → **Setup Node.js App** → Create Application:
   - Node version: 20 atau 22
   - Application root: folder di luar `public_html`, mis. `finance-app`
   - Application startup file: `app.js`
3. Environment variables di panel yang sama:
   - `DATABASE_URL` = `mysql://user:password@localhost:3306/namadb`
   - `NUXT_SESSION_PASSWORD` = string acak minimal 32 karakter
   - `NODE_ENV` = `production`
4. Upload source tanpa `node_modules/` dan `.output/`, lalu di terminal cPanel
   (setelah `source ~/nodevenv/.../activate`):

   ```bash
   npm ci
   npm run build
   npm run db:migrate
   npm run db:import -- legacy/backup-xxx.json   # sekali saja, kalau memigrasi data lama
   ```

5. Klik **Restart** di Setup Node.js App.

Tidak ada native module di dependency, jadi `npm ci` di server tidak perlu compile lewat `node-gyp`.

## Catatan teknis

- **Kunci periode** ditegakkan di server ([server/utils/periodLock.ts](server/utils/periodLock.ts)),
  bukan hanya di UI — berlaku untuk semua pengguna dan semua endpoint.
- **CRUD** sepuluh modul dibangun dari satu pabrik handler
  ([server/utils/crud.ts](server/utils/crud.ts)), dideklarasikan di
  [server/utils/tables.ts](server/utils/tables.ts).
- **Parsing CSV bank** dikerjakan di server ([server/utils/bankCsv.ts](server/utils/bankCsv.ts)),
  termasuk dedup dan hitung ulang saldo berjalan.
- **SheetJS & html2canvas** di-import dinamis dan hanya di browser, agar tidak masuk bundle SSR.
- Nilai rupiah disimpan sebagai `double`. Rupiah selalu bilangan bulat dan mantissa 53-bit
  jauh melampaui nominal apa pun yang dipakai di sini, jadi tidak ada pembulatan yang hilang.

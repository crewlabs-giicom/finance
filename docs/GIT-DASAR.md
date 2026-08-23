# Panduan Git untuk Pemula

Panduan ini untuk siapa saja yang ikut mengerjakan Finance App tapi belum terbiasa
dengan Git. Isinya cuma tiga hal: **mengambil kode, menyimpan perubahan, dan
mengirimnya**. Urusan deploy ke server tidak dibahas di sini — itu sudah diatur
otomatis, lihat [DEPLOY.md](DEPLOY.md) kalau penasaran.

---

## Konsepnya dalam 1 menit

Bayangkan proyek ini seperti **satu map kerja bersama**:

| Istilah | Artinya |
|---|---|
| **Remote** | Map induk yang disimpan di GitHub. Ini patokan bersama semua orang |
| **Lokal** | Salinan map itu di komputermu, tempat kamu bekerja |
| **Pull** | Mengambil versi terbaru dari GitHub ke komputermu |
| **Commit** | Menyimpan perubahanmu, sekalian memberi catatan "aku ubah apa" |
| **Push** | Mengirim perubahanmu ke GitHub supaya orang lain bisa ikut memakainya |
| **Branch** | Jalur pengerjaan. Kita semua pakai satu jalur, namanya `main` |

Inti aturannya cuma satu:

> **Pull dulu sebelum mulai kerja. Push setelah selesai.**

Kalau lupa pull, kamu bekerja di atas versi lama — dan itu penyebab hampir semua
masalah yang bikin pusing.

---

## Persiapan (sekali saja)

### 1. Pasang Git

Unduh di <https://git-scm.com/downloads>, lalu install. Klik Next terus sampai
selesai, pengaturan bawaannya sudah benar.

### 2. Perkenalkan dirimu ke Git

Buka **Git Bash**, ketik (ganti dengan nama & email kamu):

```bash
git config --global user.name "Nama Kamu"
git config --global user.email "email@kamu.com"
```

Ini cuma untuk menandai siapa yang mengubah apa. Cukup sekali seumur hidup.

### 3. Ambil proyeknya

```bash
cd /c/laragon/www
git clone https://github.com/crewlabs-giicom/finance.git finance-app
cd finance-app
```

Sekarang seluruh proyek sudah ada di `c:\laragon\www\finance-app`.

> Kalau diminta login, pakai akun GitHub kamu — dan pastikan akun itu sudah
> diundang ke repo-nya. Kalau belum, minta ke yang mengelola repo.

---

## Alur kerja harian

Empat langkah, urut. Semua dijalankan di **Git Bash**, dari dalam folder proyek.

### Langkah 1 — Ambil versi terbaru (SEBELUM mulai ngoding)

```bash
git pull
```

Selalu mulai dari sini. Setiap hari, setiap kali mau mulai kerja.

### Langkah 2 — Kerjakan pekerjaanmu

Edit file seperti biasa. Git tidak perlu diapa-apakan selama proses ini.

### Langkah 3 — Lihat apa saja yang berubah

```bash
git status
```

File yang kamu ubah akan disebut di situ. Biasakan mengeceknya — kalau ada nama
file yang kamu tidak merasa mengubahnya, jangan langsung dikirim, tanya dulu.

### Langkah 4 — Simpan lalu kirim

```bash
git add -A
git commit -m "Perbaiki tampilan tabel rekap saldo"
git push
```

Tiga baris itu berarti: *ambil semua perubahan* → *simpan dengan catatan* →
*kirim ke GitHub*.

**Soal pesan commit:** tulis apa yang kamu ubah dalam bahasa manusia. Bandingkan:

| ❌ Kurang membantu | ✅ Membantu |
|---|---|
| `update` | `Perbaiki total saldo yang salah hitung` |
| `fix` | `Tambah kolom keterangan di menu Aset` |
| `asdf` | `Ganti warna tombol simpan jadi hijau` |

Nanti kalau ada yang rusak, catatan inilah yang dipakai untuk menelusuri.

---

## Yang TIDAK boleh dikirim

Beberapa file sudah otomatis dikecualikan, tapi tetap perhatikan `git status`:

| File | Kenapa |
|---|---|
| `.env` | Berisi kunci rahasia aplikasi |
| `data/*.db` | Database. Isinya data asli, dan bikin bentrok kalau ikut dikirim |
| `legacy/*.json` | Data keuangan asli |
| `node_modules/` | Ukurannya ratusan MB, dibuat ulang otomatis |

Kalau salah satu nama itu muncul di `git status`, **berhenti dan tanya dulu**.

---

## Kalau ada masalah

### "Push ditolak" / `rejected` / `non-fast-forward`

Artinya: ada orang lain yang sudah push duluan, jadi versimu ketinggalan.

```bash
git pull
git push
```

Selesai. Ini kejadian normal, bukan tanda ada yang rusak.

### "Merge conflict"

Artinya: kamu dan orang lain mengubah **baris yang sama** di file yang sama, dan
Git tidak berani menebak mana yang benar.

Git akan menandai bagian yang bentrok di dalam file seperti ini:

```
<<<<<<< HEAD
tulisan versi kamu
=======
tulisan versi orang lain
>>>>>>> main
```

Yang perlu kamu lakukan: buka file itu, **hapus tiga baris penanda** (`<<<<<<<`,
`=======`, `>>>>>>>`), sisakan tulisan yang benar. Lalu:

```bash
git add -A
git commit -m "Selesaikan konflik"
git push
```

> Kalau ragu bagian mana yang benar, **jangan ditebak** — tanya dulu ke rekan yang
> mengubah bagian itu. Salah pilih di sini bisa menghapus pekerjaan orang lain.

### Aku salah ubah file, mau kembali seperti semula

Selama **belum** di-commit:

```bash
git checkout -- nama/file.vue
```

Mau membatalkan semua perubahan yang belum di-commit:

```bash
git checkout -- .
```

⚠️ Perubahan yang dibatalkan hilang permanen, tidak bisa di-undo. Pastikan dulu.

### Aku lupa pull, sudah terlanjur ngoding

Tidak apa-apa. Commit dulu pekerjaanmu, baru pull:

```bash
git add -A
git commit -m "pekerjaanku hari ini"
git pull
git push
```

Kalau muncul konflik, ikuti bagian *Merge conflict* di atas.

### Aku bingung / kelihatannya kacau

**Jangan panik dan jangan hapus foldernya.** Git hampir selalu bisa memulihkan
keadaan. Jalankan ini lalu tunjukkan hasilnya ke rekan yang lebih paham:

```bash
git status
git log --oneline -5
```

---

## Contekan

```bash
git pull                    # ambil versi terbaru (lakukan sebelum mulai kerja)
git status                  # lihat apa saja yang berubah
git add -A                  # tandai semua perubahan untuk disimpan
git commit -m "pesan"       # simpan perubahan + catatan
git push                    # kirim ke GitHub

git log --oneline -5        # lihat 5 perubahan terakhir
git checkout -- .           # batalkan semua perubahan yang belum di-commit
```

Urutan yang dipakai tiap hari:

```
git pull  →  ngoding  →  git status  →  git add -A  →  git commit -m "..."  →  git push
```

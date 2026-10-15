ALTER TABLE `ppn_rows` ADD `urutan` real DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill baris lama pakai rowid (representasi urutan insert asli di SQLite) biar
-- urutan tampilannya gak berubah, dan baris baru (urutan dari nextPpnUrutan()/max+1)
-- selalu lebih besar sehingga tetap nongol di paling bawah.
UPDATE `ppn_rows` SET `urutan` = `rowid`;
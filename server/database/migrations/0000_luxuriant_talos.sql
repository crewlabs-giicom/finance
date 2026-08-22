CREATE TABLE `aset_depresiasi_log` (
	`id` text PRIMARY KEY NOT NULL,
	`aset_id` text NOT NULL,
	`periode` text NOT NULL,
	`tanggal` text NOT NULL,
	FOREIGN KEY (`aset_id`) REFERENCES `aset_rows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `aset_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`tipe` text DEFAULT '',
	`kategori` text DEFAULT '',
	`grup_id` text,
	`div` text DEFAULT '',
	`nama` text NOT NULL,
	`deposit` real DEFAULT 0 NOT NULL,
	`bank_account_id` text,
	`tgl_mulai` text,
	`no_aset` text DEFAULT '',
	`keterangan` text DEFAULT '',
	`umur_ekonomis` real DEFAULT 0 NOT NULL,
	`harga_perolehan` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`grup_id`) REFERENCES `bank_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `aset_simple_master` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `avp_lawan` (
	`id` text PRIMARY KEY NOT NULL,
	`row_id` text NOT NULL,
	`partner_id` text NOT NULL,
	FOREIGN KEY (`row_id`) REFERENCES `avp_rows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `avp_rows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `avp_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`coa_id` text,
	`group_id` text,
	`tanggal` text NOT NULL,
	`code` text DEFAULT '',
	`store` text DEFAULT '',
	`description` text DEFAULT '',
	`tags` text DEFAULT '',
	`debet` real DEFAULT 0 NOT NULL,
	`kredit` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`coa_id`) REFERENCES `coa_master`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text,
	`bank_type` text NOT NULL,
	`nama_rek` text NOT NULL,
	`no_rek` text NOT NULL,
	`saldo` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`pic` text DEFAULT '',
	`rek` text DEFAULT '' NOT NULL,
	`saldo` real DEFAULT 0 NOT NULL,
	`bisa_dipakai` real,
	`ket` text DEFAULT '',
	`grup` text,
	FOREIGN KEY (`grup`) REFERENCES `bank_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`nama` text NOT NULL,
	`warna` text DEFAULT '#6C5CE7'
);
--> statement-breakpoint
CREATE TABLE `bank_txns` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`tanggal` text NOT NULL,
	`transaksi` text DEFAULT '' NOT NULL,
	`cabang` text DEFAULT '',
	`debet` real DEFAULT 0 NOT NULL,
	`kredit` real DEFAULT 0 NOT NULL,
	`saldo` real DEFAULT 0 NOT NULL,
	`bank_type` text DEFAULT '',
	`no_bank_manual` text DEFAULT '',
	`ket_transaksi_manual` text DEFAULT '',
	`tag` text DEFAULT '',
	`note_manual` text DEFAULT '',
	`checked` integer DEFAULT false NOT NULL,
	`manual` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bayar_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`pt` text DEFAULT '',
	`nominal` real DEFAULT 0 NOT NULL,
	`tgl_bayar` text,
	`tgl_pesan` text,
	`no_ctr` text DEFAULT '',
	`pay_iam` text DEFAULT '',
	`pay_ekspds` text DEFAULT '',
	`ket` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `coa_master` (
	`id` text PRIMARY KEY NOT NULL,
	`no_coa` text NOT NULL,
	`nama_coa` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deposito_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`nama` text DEFAULT '',
	`nominal` real DEFAULT 0 NOT NULL,
	`tgl_masuk` text,
	`rate` text DEFAULT '',
	`jatuh_tempo` text,
	`ket` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `dn_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`tanggal` text,
	`description` text DEFAULT '',
	`amount` real DEFAULT 0 NOT NULL,
	`npwp_id` text,
	FOREIGN KEY (`npwp_id`) REFERENCES `npwp_master`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ent_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`source_txn_id` text,
	`group_id` text,
	`tanggal` text NOT NULL,
	`place` text DEFAULT '',
	`alamat` text DEFAULT '',
	`description` text DEFAULT '',
	`jenis` text DEFAULT '',
	`amount` real DEFAULT 0 NOT NULL,
	`client_name` text DEFAULT '',
	`posisi` text DEFAULT '',
	`company` text DEFAULT '',
	`jenis_usaha` text DEFAULT '',
	`note` text DEFAULT '',
	FOREIGN KEY (`source_txn_id`) REFERENCES `bank_txns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hutang_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`peminjam` text DEFAULT '',
	`kreditur` text DEFAULT '',
	`nominal` real DEFAULT 0 NOT NULL,
	`rate` text DEFAULT '',
	`tgl_pinjam` text,
	`jatuh_tempo` text,
	`ket` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `mp_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`tanggal` text NOT NULL,
	`debet` real DEFAULT 0 NOT NULL,
	`kredit` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `mp_stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mp_entries_store_date_idx` ON `mp_entries` (`store_id`,`tanggal`);--> statement-breakpoint
CREATE TABLE `mp_stores` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text,
	`nama` text NOT NULL,
	`platform` text DEFAULT '',
	`saldo_awal` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `npwp_master` (
	`id` text PRIMARY KEY NOT NULL,
	`no_npwp` text NOT NULL,
	`nama_npwp` text NOT NULL,
	`nik` text DEFAULT '',
	`alamat` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `period_lock` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`lock_ym` text
);
--> statement-breakpoint
CREATE TABLE `ppn_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`source_txn_id` text,
	`group_id` text,
	`tanggal` text NOT NULL,
	`code` text DEFAULT '',
	`store` text DEFAULT '',
	`description` text DEFAULT '',
	`tags` text DEFAULT '',
	`debet` real DEFAULT 0 NOT NULL,
	`kredit` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '',
	`npwp_id` text,
	`no_invoice` text DEFAULT '',
	`net_dibayarkan` real,
	`ppn` real,
	`dpp` real,
	`pph23` real,
	`pph23_4a2` real,
	`pph21bp` real,
	`lampiran_faktur_pajak` text DEFAULT '',
	`masa_kredit` text DEFAULT '',
	`bentuk_jenis_biaya` text DEFAULT '',
	FOREIGN KEY (`source_txn_id`) REFERENCES `bank_txns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`npwp_id`) REFERENCES `npwp_master`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `row_colors` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`color` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `row_colors_entity_unique` ON `row_colors` (`entity_kind`,`entity_id`);--> statement-breakpoint
CREATE TABLE `tag_master` (
	`id` text PRIMARY KEY NOT NULL,
	`nama` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_master_nama_unique` ON `tag_master` (`nama`);--> statement-breakpoint
CREATE TABLE `te_finance_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`tanggal` text,
	`no_waybill` text NOT NULL,
	`biaya` real DEFAULT 0 NOT NULL,
	`nama_penerima` text DEFAULT '',
	`keterangan` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `te_gudang_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`tanggal` text,
	`nama_pengirim` text DEFAULT '',
	`nama_penerima` text DEFAULT '',
	`inv_gii` text DEFAULT '',
	`no_waybill` text NOT NULL,
	`biaya` real DEFAULT 0 NOT NULL,
	`keperluan` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
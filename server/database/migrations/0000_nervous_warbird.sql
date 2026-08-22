CREATE TABLE `aset_depresiasi_log` (
	`id` varchar(64) NOT NULL,
	`aset_id` varchar(64) NOT NULL,
	`periode` varchar(7) NOT NULL,
	`tanggal` varchar(10) NOT NULL,
	CONSTRAINT `aset_depresiasi_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aset_rows` (
	`id` varchar(64) NOT NULL,
	`tipe` varchar(255) DEFAULT '',
	`kategori` varchar(255) DEFAULT '',
	`grup_id` varchar(64),
	`div` varchar(255) DEFAULT '',
	`nama` varchar(255) NOT NULL,
	`deposit` double NOT NULL DEFAULT 0,
	`bank_account_id` varchar(64),
	`tgl_mulai` varchar(10),
	`no_aset` varchar(255) DEFAULT '',
	`keterangan` varchar(500) DEFAULT '',
	`umur_ekonomis` double NOT NULL DEFAULT 0,
	`harga_perolehan` double NOT NULL DEFAULT 0,
	CONSTRAINT `aset_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aset_simple_master` (
	`id` varchar(64) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`value` varchar(255) NOT NULL,
	CONSTRAINT `aset_simple_master_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `avp_lawan` (
	`id` varchar(64) NOT NULL,
	`row_id` varchar(64) NOT NULL,
	`partner_id` varchar(64) NOT NULL,
	CONSTRAINT `avp_lawan_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `avp_rows` (
	`id` varchar(64) NOT NULL,
	`coa_id` varchar(64),
	`group_id` varchar(64),
	`tanggal` varchar(10) NOT NULL,
	`code` varchar(255) DEFAULT '',
	`store` varchar(255) DEFAULT '',
	`description` text,
	`tags` varchar(255) DEFAULT '',
	`debet` double NOT NULL DEFAULT 0,
	`kredit` double NOT NULL DEFAULT 0,
	CONSTRAINT `avp_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` varchar(64) NOT NULL,
	`group_id` varchar(64),
	`bank_type` varchar(32) NOT NULL,
	`nama_rek` varchar(255) NOT NULL,
	`no_rek` varchar(64) NOT NULL,
	`saldo_awal` double,
	CONSTRAINT `bank_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bank_balances` (
	`id` varchar(64) NOT NULL,
	`pic` varchar(255) DEFAULT '',
	`rek` varchar(255) NOT NULL DEFAULT '',
	`saldo` double NOT NULL DEFAULT 0,
	`bisa_dipakai` double,
	`ket` varchar(500) DEFAULT '',
	`grup` varchar(64),
	CONSTRAINT `bank_balances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bank_groups` (
	`id` varchar(64) NOT NULL,
	`nama` varchar(255) NOT NULL,
	`warna` varchar(32) DEFAULT '#6C5CE7',
	CONSTRAINT `bank_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bank_txns` (
	`id` varchar(64) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`tanggal` varchar(10) NOT NULL,
	`transaksi` text NOT NULL,
	`cabang` varchar(255) DEFAULT '',
	`debet` double NOT NULL DEFAULT 0,
	`kredit` double NOT NULL DEFAULT 0,
	`saldo` double NOT NULL DEFAULT 0,
	`bank_type` varchar(32) DEFAULT '',
	`no_bank_manual` varchar(255) DEFAULT '',
	`ket_transaksi_manual` text,
	`tag` varchar(255) DEFAULT '',
	`note_manual` text,
	`checked` boolean NOT NULL DEFAULT false,
	`manual` boolean NOT NULL DEFAULT false,
	CONSTRAINT `bank_txns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bayar_rows` (
	`id` varchar(64) NOT NULL,
	`pt` varchar(255) DEFAULT '',
	`nominal` double NOT NULL DEFAULT 0,
	`tgl_bayar` varchar(10),
	`tgl_pesan` varchar(10),
	`no_ctr` varchar(255) DEFAULT '',
	`pay_iam` varchar(255) DEFAULT '',
	`pay_ekspds` varchar(255) DEFAULT '',
	`ket` varchar(500) DEFAULT '',
	CONSTRAINT `bayar_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coa_master` (
	`id` varchar(64) NOT NULL,
	`no_coa` varchar(64) NOT NULL,
	`nama_coa` varchar(255) NOT NULL,
	CONSTRAINT `coa_master_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deposito_rows` (
	`id` varchar(64) NOT NULL,
	`nama` varchar(255) DEFAULT '',
	`nominal` double NOT NULL DEFAULT 0,
	`tgl_masuk` varchar(10),
	`rate` varchar(64) DEFAULT '',
	`jatuh_tempo` varchar(10),
	`ket` varchar(500) DEFAULT '',
	CONSTRAINT `deposito_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dn_rows` (
	`id` varchar(64) NOT NULL,
	`tanggal` varchar(10),
	`description` text,
	`amount` double NOT NULL DEFAULT 0,
	`npwp_id` varchar(64),
	CONSTRAINT `dn_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ent_rows` (
	`id` varchar(64) NOT NULL,
	`source_txn_id` varchar(64),
	`group_id` varchar(64),
	`tanggal` varchar(10) NOT NULL,
	`place` varchar(255) DEFAULT '',
	`alamat` varchar(500) DEFAULT '',
	`description` text,
	`jenis` varchar(255) DEFAULT '',
	`amount` double NOT NULL DEFAULT 0,
	`client_name` varchar(255) DEFAULT '',
	`posisi` varchar(255) DEFAULT '',
	`company` varchar(255) DEFAULT '',
	`jenis_usaha` varchar(255) DEFAULT '',
	`note` text,
	CONSTRAINT `ent_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hutang_rows` (
	`id` varchar(64) NOT NULL,
	`peminjam` varchar(255) DEFAULT '',
	`kreditur` varchar(255) DEFAULT '',
	`nominal` double NOT NULL DEFAULT 0,
	`rate` varchar(64) DEFAULT '',
	`tgl_pinjam` varchar(10),
	`jatuh_tempo` varchar(10),
	`ket` varchar(500) DEFAULT '',
	CONSTRAINT `hutang_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mp_entries` (
	`id` varchar(64) NOT NULL,
	`store_id` varchar(64) NOT NULL,
	`tanggal` varchar(10) NOT NULL,
	`debet` double NOT NULL DEFAULT 0,
	`kredit` double NOT NULL DEFAULT 0,
	CONSTRAINT `mp_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `mp_entries_store_date_idx` UNIQUE(`store_id`,`tanggal`)
);
--> statement-breakpoint
CREATE TABLE `mp_stores` (
	`id` varchar(64) NOT NULL,
	`group_id` varchar(64),
	`nama` varchar(255) NOT NULL,
	`platform` varchar(64) DEFAULT '',
	`saldo_awal` double NOT NULL DEFAULT 0,
	CONSTRAINT `mp_stores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `npwp_master` (
	`id` varchar(64) NOT NULL,
	`no_npwp` varchar(64) NOT NULL,
	`nama_npwp` varchar(255) NOT NULL,
	`nik` varchar(64) DEFAULT '',
	`alamat` varchar(500) DEFAULT '',
	CONSTRAINT `npwp_master_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `period_lock` (
	`id` int NOT NULL DEFAULT 1,
	`lock_ym` varchar(7),
	CONSTRAINT `period_lock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ppn_rows` (
	`id` varchar(64) NOT NULL,
	`source_txn_id` varchar(64),
	`group_id` varchar(64),
	`tanggal` varchar(10) NOT NULL,
	`code` varchar(255) DEFAULT '',
	`store` varchar(255) DEFAULT '',
	`description` text,
	`tags` varchar(255) DEFAULT '',
	`debet` double NOT NULL DEFAULT 0,
	`kredit` double NOT NULL DEFAULT 0,
	`note` text,
	`npwp_id` varchar(64),
	`no_invoice` varchar(255) DEFAULT '',
	`net_dibayarkan` double,
	`ppn` double,
	`dpp` double,
	`pph23` double,
	`pph23_4a2` double,
	`pph21bp` double,
	`lampiran_faktur_pajak` varchar(255) DEFAULT '',
	`masa_kredit` varchar(7) DEFAULT '',
	`bentuk_jenis_biaya` varchar(255) DEFAULT '',
	CONSTRAINT `ppn_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `row_colors` (
	`id` varchar(64) NOT NULL,
	`entity_kind` varchar(32) NOT NULL,
	`entity_id` varchar(128) NOT NULL,
	`color` varchar(32) NOT NULL,
	CONSTRAINT `row_colors_id` PRIMARY KEY(`id`),
	CONSTRAINT `row_colors_entity_unique` UNIQUE(`entity_kind`,`entity_id`)
);
--> statement-breakpoint
CREATE TABLE `tag_master` (
	`id` varchar(64) NOT NULL,
	`nama` varchar(191) NOT NULL,
	CONSTRAINT `tag_master_id` PRIMARY KEY(`id`),
	CONSTRAINT `tag_master_nama_unique` UNIQUE(`nama`)
);
--> statement-breakpoint
CREATE TABLE `te_finance_rows` (
	`id` varchar(64) NOT NULL,
	`tanggal` varchar(10),
	`no_waybill` varchar(128) NOT NULL,
	`biaya` double NOT NULL DEFAULT 0,
	`nama_penerima` varchar(255) DEFAULT '',
	`keterangan` varchar(500) DEFAULT '',
	CONSTRAINT `te_finance_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `te_gudang_rows` (
	`id` varchar(64) NOT NULL,
	`tanggal` varchar(10),
	`nama_pengirim` varchar(255) DEFAULT '',
	`nama_penerima` varchar(255) DEFAULT '',
	`inv_gii` varchar(255) DEFAULT '',
	`no_waybill` varchar(128) NOT NULL,
	`biaya` double NOT NULL DEFAULT 0,
	`keperluan` varchar(500) DEFAULT '',
	CONSTRAINT `te_gudang_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` varchar(32) NOT NULL DEFAULT 'staff',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `aset_depresiasi_log` ADD CONSTRAINT `aset_depresiasi_log_aset_id_aset_rows_id_fk` FOREIGN KEY (`aset_id`) REFERENCES `aset_rows`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aset_rows` ADD CONSTRAINT `aset_rows_grup_id_bank_groups_id_fk` FOREIGN KEY (`grup_id`) REFERENCES `bank_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aset_rows` ADD CONSTRAINT `aset_rows_bank_account_id_bank_accounts_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `avp_lawan` ADD CONSTRAINT `avp_lawan_row_id_avp_rows_id_fk` FOREIGN KEY (`row_id`) REFERENCES `avp_rows`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `avp_lawan` ADD CONSTRAINT `avp_lawan_partner_id_avp_rows_id_fk` FOREIGN KEY (`partner_id`) REFERENCES `avp_rows`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `avp_rows` ADD CONSTRAINT `avp_rows_coa_id_coa_master_id_fk` FOREIGN KEY (`coa_id`) REFERENCES `coa_master`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `avp_rows` ADD CONSTRAINT `avp_rows_group_id_bank_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_group_id_bank_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bank_balances` ADD CONSTRAINT `bank_balances_grup_bank_groups_id_fk` FOREIGN KEY (`grup`) REFERENCES `bank_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bank_txns` ADD CONSTRAINT `bank_txns_account_id_bank_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dn_rows` ADD CONSTRAINT `dn_rows_npwp_id_npwp_master_id_fk` FOREIGN KEY (`npwp_id`) REFERENCES `npwp_master`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ent_rows` ADD CONSTRAINT `ent_rows_source_txn_id_bank_txns_id_fk` FOREIGN KEY (`source_txn_id`) REFERENCES `bank_txns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ent_rows` ADD CONSTRAINT `ent_rows_group_id_bank_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mp_entries` ADD CONSTRAINT `mp_entries_store_id_mp_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `mp_stores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mp_stores` ADD CONSTRAINT `mp_stores_group_id_bank_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ppn_rows` ADD CONSTRAINT `ppn_rows_source_txn_id_bank_txns_id_fk` FOREIGN KEY (`source_txn_id`) REFERENCES `bank_txns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ppn_rows` ADD CONSTRAINT `ppn_rows_group_id_bank_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ppn_rows` ADD CONSTRAINT `ppn_rows_npwp_id_npwp_master_id_fk` FOREIGN KEY (`npwp_id`) REFERENCES `npwp_master`(`id`) ON DELETE no action ON UPDATE no action;
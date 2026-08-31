CREATE INDEX `avp_rows_group_idx` ON `avp_rows` (`group_id`);--> statement-breakpoint
CREATE INDEX `avp_rows_coa_idx` ON `avp_rows` (`coa_id`);--> statement-breakpoint
CREATE INDEX `avp_rows_tanggal_idx` ON `avp_rows` (`tanggal`);--> statement-breakpoint
CREATE INDEX `bank_accounts_group_idx` ON `bank_accounts` (`group_id`);--> statement-breakpoint
CREATE INDEX `bank_accounts_pic_idx` ON `bank_accounts` (`pic_id`);--> statement-breakpoint
CREATE INDEX `bank_txns_account_tanggal_idx` ON `bank_txns` (`account_id`,`tanggal`,`urutan`);--> statement-breakpoint
CREATE INDEX `ent_rows_group_idx` ON `ent_rows` (`group_id`);--> statement-breakpoint
CREATE INDEX `ent_rows_source_txn_idx` ON `ent_rows` (`source_txn_id`);--> statement-breakpoint
CREATE INDEX `ent_rows_tanggal_idx` ON `ent_rows` (`tanggal`);--> statement-breakpoint
CREATE INDEX `mp_entries_tanggal_idx` ON `mp_entries` (`tanggal`);--> statement-breakpoint
CREATE INDEX `ppn_rows_group_idx` ON `ppn_rows` (`group_id`);--> statement-breakpoint
CREATE INDEX `ppn_rows_source_txn_idx` ON `ppn_rows` (`source_txn_id`);--> statement-breakpoint
CREATE INDEX `ppn_rows_tanggal_idx` ON `ppn_rows` (`tanggal`);
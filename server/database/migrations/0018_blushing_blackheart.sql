CREATE TABLE `cek_ump_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`tanggal` text NOT NULL,
	`transaksi` text DEFAULT '',
	`code` text DEFAULT '',
	`description` text,
	`coa_id` text,
	`debet` real DEFAULT 0 NOT NULL,
	`kredit` real DEFAULT 0 NOT NULL,
	`pt` text DEFAULT '',
	`store` text DEFAULT '',
	`group_id` text,
	`pic_id` text,
	`tag` text DEFAULT '',
	`match_no` integer,
	FOREIGN KEY (`coa_id`) REFERENCES `coa_master`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `bank_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pic_id`) REFERENCES `pics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cek_ump_rows_coa_idx` ON `cek_ump_rows` (`coa_id`);--> statement-breakpoint
CREATE INDEX `cek_ump_rows_pic_idx` ON `cek_ump_rows` (`pic_id`);--> statement-breakpoint
CREATE INDEX `cek_ump_rows_tanggal_idx` ON `cek_ump_rows` (`tanggal`);--> statement-breakpoint
CREATE INDEX `cek_ump_rows_match_no_idx` ON `cek_ump_rows` (`match_no`);
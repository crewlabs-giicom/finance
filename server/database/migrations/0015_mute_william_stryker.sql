CREATE TABLE `pm_kategori_master` (
	`id` text PRIMARY KEY NOT NULL,
	`nama` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pm_kategori_master_nama_unique` ON `pm_kategori_master` (`nama`);--> statement-breakpoint
ALTER TABLE `ppn_rows` ADD `ket_status` text;--> statement-breakpoint
ALTER TABLE `ppn_rows` ADD `ket_kategori` text;
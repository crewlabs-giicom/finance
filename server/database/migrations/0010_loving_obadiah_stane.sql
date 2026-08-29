ALTER TABLE `bank_txns` ADD `urutan` real;--> statement-breakpoint
UPDATE `bank_txns` SET `urutan` = `rowid`;
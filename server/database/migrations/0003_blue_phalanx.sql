PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bank_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`pic` text,
	`rek` text DEFAULT '' NOT NULL,
	`saldo` real DEFAULT 0 NOT NULL,
	`bisa_dipakai` real,
	`ket` text DEFAULT '',
	`grup` text,
	FOREIGN KEY (`pic`) REFERENCES `pics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grup`) REFERENCES `bank_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_bank_balances`("id", "pic", "rek", "saldo", "bisa_dipakai", "ket", "grup") SELECT "id", "pic", "rek", "saldo", "bisa_dipakai", "ket", "grup" FROM `bank_balances`;--> statement-breakpoint
DROP TABLE `bank_balances`;--> statement-breakpoint
ALTER TABLE `__new_bank_balances` RENAME TO `bank_balances`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
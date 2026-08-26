DROP TABLE `saldo_lock`;--> statement-breakpoint
ALTER TABLE `bank_balances` ADD `locked` integer DEFAULT false NOT NULL;
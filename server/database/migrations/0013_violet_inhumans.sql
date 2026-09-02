ALTER TABLE `deposito_rows` ADD `group_id` text REFERENCES bank_groups(id);--> statement-breakpoint
ALTER TABLE `hutang_rows` ADD `group_id` text REFERENCES bank_groups(id);
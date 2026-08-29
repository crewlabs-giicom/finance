ALTER TABLE `bayar_rows` ADD `group_id` text REFERENCES bank_groups(id);--> statement-breakpoint
UPDATE `bayar_rows` SET `group_id` = 'gim' WHERE `pt` = 'GIM';--> statement-breakpoint
UPDATE `bayar_rows` SET `group_id` = 'g1787200471108' WHERE `pt` = 'RRR';--> statement-breakpoint
UPDATE `bayar_rows` SET `group_id` = 'sum' WHERE `pt` = 'SSS';--> statement-breakpoint
UPDATE `bayar_rows` SET `group_id` = 'pribadi' WHERE `pt` = 'COM';--> statement-breakpoint
UPDATE `bayar_rows` SET `group_id` = 'bii' WHERE `pt` = 'BBB';
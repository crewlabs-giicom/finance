CREATE TABLE `pics` (
	`id` text PRIMARY KEY NOT NULL,
	`nama` text NOT NULL,
	`urutan` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `pic_id` text REFERENCES pics(id);
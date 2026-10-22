CREATE TABLE `drafts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `looks` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`state` text NOT NULL,
	`image_key` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);

CREATE TABLE `garments` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`source_url` text NOT NULL,
	`image_key` text NOT NULL,
	`mime` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);

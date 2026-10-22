CREATE TABLE `ai_requests` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`request_key` text NOT NULL,
	`result` text,
	PRIMARY KEY(`user_id`, `day`, `request_key`)
);
--> statement-breakpoint
CREATE TABLE `login_flows` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`verifier` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `garments` ADD `features` text DEFAULT '' NOT NULL;
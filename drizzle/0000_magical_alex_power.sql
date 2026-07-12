CREATE TABLE `user_training_states` (
	`user_key` text PRIMARY KEY NOT NULL,
	`schema_version` integer DEFAULT 3 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`state_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_training_states_updated_at_idx` ON `user_training_states` (`updated_at`);
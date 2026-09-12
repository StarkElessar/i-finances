ALTER TABLE `receipt_imports` ADD `contacts_snapshot_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `receipt_imports` ADD `contacts_snapshot_version` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `receipt_processing_jobs` DROP COLUMN `worker_id`;--> statement-breakpoint
ALTER TABLE `receipt_processing_jobs` DROP COLUMN `lease_token_hash`;--> statement-breakpoint
ALTER TABLE `receipt_processing_jobs` DROP COLUMN `lease_expires_at`;--> statement-breakpoint
ALTER TABLE `receipt_processing_jobs` DROP COLUMN `last_heartbeat_at`;
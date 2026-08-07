CREATE TABLE `receipt_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text,
	`status` text NOT NULL,
	`image_storage_key` text NOT NULL,
	`image_original_name` text NOT NULL,
	`image_content_type` text NOT NULL,
	`image_size_bytes` integer NOT NULL,
	`image_sha256` text NOT NULL,
	`image_delete_after` integer,
	`image_deleted_at` integer,
	`categories_snapshot_json` text NOT NULL,
	`categories_snapshot_version` text NOT NULL,
	`result_json` text,
	`review_comment` text DEFAULT '' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`approved_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "receipt_imports_status_check" CHECK("receipt_imports"."status" IN (
				'queued',
				'processing',
				'needs_review',
				'revision_requested',
				'approving',
				'approved',
				'failed',
				'cancelled'
			)),
	CONSTRAINT "receipt_imports_image_size_positive_check" CHECK("receipt_imports"."image_size_bytes" > 0)
);
--> statement-breakpoint
CREATE INDEX `receipt_imports_household_created_idx` ON `receipt_imports` (`household_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `receipt_imports_household_status_idx` ON `receipt_imports` (`household_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_imports_image_storage_key_unique` ON `receipt_imports` (`image_storage_key`);--> statement-breakpoint
CREATE TABLE `receipt_operation_links` (
	`receipt_import_id` text NOT NULL,
	`group_key` text NOT NULL,
	`operation_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`receipt_import_id`, `group_key`),
	FOREIGN KEY (`receipt_import_id`) REFERENCES `receipt_imports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `receipt_operation_links_operation_idx` ON `receipt_operation_links` (`operation_id`);--> statement-breakpoint
CREATE TABLE `receipt_processing_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_import_id` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`requested_pipeline_version` text NOT NULL,
	`worker_id` text,
	`lease_token_hash` text,
	`lease_expires_at` integer,
	`last_heartbeat_at` integer,
	`result_sha256` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`receipt_import_id`) REFERENCES `receipt_imports`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "receipt_processing_jobs_status_check" CHECK("receipt_processing_jobs"."status" IN (
				'queued',
				'leased',
				'completed',
				'failed',
				'cancelled'
			)),
	CONSTRAINT "receipt_processing_jobs_attempt_nonnegative_check" CHECK("receipt_processing_jobs"."attempt" >= 0)
);
--> statement-breakpoint
CREATE INDEX `receipt_processing_jobs_receipt_created_idx` ON `receipt_processing_jobs` (`receipt_import_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `receipt_processing_jobs_status_created_idx` ON `receipt_processing_jobs` (`status`,`created_at`);
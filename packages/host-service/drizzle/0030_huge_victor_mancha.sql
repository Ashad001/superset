-- IF NOT EXISTS because `local_tasks` shipped before it had a migration: it was
-- generated locally, applied to a dev host, and never committed. Machines that
-- ran that orphan already have the table, and a bare CREATE would crash the
-- host service on startup for them.
CREATE TABLE IF NOT EXISTS `local_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_tasks_project_id_idx` ON `local_tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_tasks_status_idx` ON `local_tasks` (`status`);

ALTER TABLE `field_visits` ADD `place_label` varchar(150);--> statement-breakpoint
CREATE INDEX `sms_messages_phone_created_idx` ON `sms_messages` (`phone`,`created_at`);
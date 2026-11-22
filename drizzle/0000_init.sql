CREATE TABLE `auth_accounts` (
	`id` varchar(36) NOT NULL,
	`account_id` varchar(191) NOT NULL,
	`provider_id` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`password` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `auth_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` varchar(36) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`ip_address` varchar(64),
	`user_agent` text,
	`user_id` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_token_uq` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` varchar(36) NOT NULL,
	`name` varchar(191) NOT NULL,
	`email` varchar(191) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`phone_number` varchar(20),
	`phone_number_verified` boolean,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `auth_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_users_email_uq` UNIQUE(`email`),
	CONSTRAINT `auth_users_phone_number_uq` UNIQUE(`phone_number`)
);
--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` varchar(36) NOT NULL,
	`identifier` varchar(191) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `auth_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`head_employee_id` bigint unsigned,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `departments_id` PRIMARY KEY(`id`),
	CONSTRAINT `departments_name_uq` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `employee_documents` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`employee_id` bigint unsigned NOT NULL,
	`label` varchar(100) NOT NULL,
	`file_key` varchar(255) NOT NULL,
	`uploaded_by` bigint unsigned,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `employee_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employee_locations` (
	`employee_id` bigint unsigned NOT NULL,
	`location_id` bigint unsigned NOT NULL,
	CONSTRAINT `employee_locations_employee_id_location_id_pk` PRIMARY KEY(`employee_id`,`location_id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`emp_code` varchar(20) NOT NULL,
	`name` varchar(120) NOT NULL,
	`mobile` varchar(20) NOT NULL,
	`email` varchar(191),
	`photo_key` varchar(255),
	`role` varchar(20) NOT NULL DEFAULT 'employee',
	`department_id` bigint unsigned,
	`designation` varchar(100),
	`shift_id` bigint unsigned,
	`manager_id` bigint unsigned,
	`leave_policy_id` bigint unsigned,
	`work_type` varchar(10) NOT NULL DEFAULT 'office',
	`status` varchar(12) NOT NULL DEFAULT 'active',
	`joined_on` date,
	`left_on` date,
	`date_of_birth` date,
	`address` text,
	`emergency_contact_name` varchar(120),
	`emergency_contact_phone` varchar(20),
	`monthly_salary` decimal(12,2),
	`active_device_id` varchar(100),
	`user_id` varchar(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_emp_code_uq` UNIQUE(`emp_code`),
	CONSTRAINT `employees_mobile_uq` UNIQUE(`mobile`),
	CONSTRAINT `employees_user_id_uq` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `holidays` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`name` varchar(100) NOT NULL,
	`is_optional` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `holidays_id` PRIMARY KEY(`id`),
	CONSTRAINT `holidays_date_uq` UNIQUE(`date`)
);
--> statement-breakpoint
CREATE TABLE `office_locations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`address` varchar(255),
	`lat` decimal(10,7) NOT NULL,
	`lng` decimal(10,7) NOT NULL,
	`radius_m` smallint unsigned NOT NULL DEFAULT 150,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `office_locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`start_time` time NOT NULL,
	`end_time` time NOT NULL,
	`crosses_midnight` boolean NOT NULL DEFAULT false,
	`break_minutes` smallint unsigned NOT NULL DEFAULT 60,
	`grace_minutes` smallint unsigned NOT NULL DEFAULT 15,
	`half_day_after` time,
	`half_day_below_minutes` smallint unsigned NOT NULL DEFAULT 270,
	`absent_below_minutes` smallint unsigned NOT NULL DEFAULT 120,
	`overtime_after_minutes` smallint unsigned NOT NULL DEFAULT 30,
	`lates_per_half_day` tinyint unsigned NOT NULL DEFAULT 3,
	`weekly_offs` json NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`employee_id` bigint unsigned NOT NULL,
	`date` date NOT NULL,
	`shift_id` bigint unsigned,
	`status` varchar(15) NOT NULL,
	`check_in_at` datetime(3),
	`check_in_lat` decimal(10,7),
	`check_in_lng` decimal(10,7),
	`check_in_accuracy_m` int unsigned,
	`check_in_location_id` bigint unsigned,
	`check_in_distance_m` int unsigned,
	`check_in_photo_key` varchar(255),
	`check_out_at` datetime(3),
	`check_out_lat` decimal(10,7),
	`check_out_lng` decimal(10,7),
	`check_out_accuracy_m` int unsigned,
	`check_out_photo_key` varchar(255),
	`worked_minutes` smallint unsigned NOT NULL DEFAULT 0,
	`late_minutes` smallint unsigned NOT NULL DEFAULT 0,
	`overtime_minutes` smallint unsigned NOT NULL DEFAULT 0,
	`leave_request_id` bigint unsigned,
	`flags` json,
	`note` varchar(255),
	`updated_by` bigint unsigned,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_employee_date_uq` UNIQUE(`employee_id`,`date`)
);
--> statement-breakpoint
CREATE TABLE `regularisations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`employee_id` bigint unsigned NOT NULL,
	`date` date NOT NULL,
	`attendance_id` bigint unsigned,
	`type` varchar(20) NOT NULL,
	`requested_check_in_at` datetime(3),
	`requested_check_out_at` datetime(3),
	`reason` varchar(500) NOT NULL,
	`status` varchar(10) NOT NULL DEFAULT 'pending',
	`decided_by` bigint unsigned,
	`decided_at` datetime(3),
	`decision_remark` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `regularisations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leave_balance_adjustments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`employee_id` bigint unsigned NOT NULL,
	`leave_type_id` bigint unsigned NOT NULL,
	`year` smallint unsigned NOT NULL,
	`kind` varchar(15) NOT NULL,
	`days` decimal(5,2) NOT NULL,
	`reason` varchar(255) NOT NULL,
	`expires_on` date,
	`created_by` bigint unsigned,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `leave_balance_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leave_balances` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`employee_id` bigint unsigned NOT NULL,
	`leave_type_id` bigint unsigned NOT NULL,
	`year` smallint unsigned NOT NULL,
	`opening` decimal(5,2) NOT NULL DEFAULT 0,
	`credited` decimal(5,2) NOT NULL DEFAULT 0,
	`used` decimal(5,2) NOT NULL DEFAULT 0,
	`adjusted` decimal(5,2) NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `leave_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `leave_balances_employee_type_year_uq` UNIQUE(`employee_id`,`leave_type_id`,`year`)
);
--> statement-breakpoint
CREATE TABLE `leave_policies` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `leave_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `leave_policies_name_uq` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `leave_policy_types` (
	`policy_id` bigint unsigned NOT NULL,
	`leave_type_id` bigint unsigned NOT NULL,
	`yearly_quota` decimal(5,2) NOT NULL DEFAULT 0,
	`accrual` varchar(10) NOT NULL DEFAULT 'yearly',
	`carry_forward_max` decimal(5,2) NOT NULL DEFAULT 0,
	`min_notice_days` tinyint unsigned NOT NULL DEFAULT 0,
	`max_continuous_days` tinyint unsigned,
	`document_after_days` tinyint unsigned,
	`expires_after_days` smallint unsigned,
	CONSTRAINT `leave_policy_types_policy_id_leave_type_id_pk` PRIMARY KEY(`policy_id`,`leave_type_id`)
);
--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`employee_id` bigint unsigned NOT NULL,
	`leave_type_id` bigint unsigned NOT NULL,
	`from_date` date NOT NULL,
	`to_date` date NOT NULL,
	`half_day` varchar(12),
	`days` decimal(5,2) NOT NULL,
	`reason` varchar(500),
	`attachment_key` varchar(255),
	`status` varchar(10) NOT NULL DEFAULT 'pending',
	`approver_id` bigint unsigned,
	`decided_at` datetime(3),
	`decision_remark` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `leave_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leave_types` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(10) NOT NULL,
	`name` varchar(60) NOT NULL,
	`is_paid` boolean NOT NULL DEFAULT true,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `leave_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `leave_types_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `field_visits` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`employee_id` bigint unsigned NOT NULL,
	`client_id` bigint unsigned,
	`site_id` bigint unsigned,
	`prospect_name` varchar(150),
	`prospect_phone` varchar(20),
	`purpose` varchar(20) NOT NULL,
	`contact_name` varchar(120),
	`contact_phone` varchar(20),
	`notes` text,
	`outcome` varchar(20),
	`logged_at` datetime(3) NOT NULL,
	`lat` decimal(10,7) NOT NULL,
	`lng` decimal(10,7) NOT NULL,
	`accuracy_m` int unsigned,
	`photo_key` varchar(255),
	`distance_from_site_m` int unsigned,
	`flags` json,
	`status` varchar(10) NOT NULL DEFAULT 'pending',
	`reviewed_by` bigint unsigned,
	`reviewed_at` datetime(3),
	`review_remark` varchar(255),
	`service_visit_id` bigint unsigned,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `field_visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `follow_ups` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`field_visit_id` bigint unsigned NOT NULL,
	`employee_id` bigint unsigned NOT NULL,
	`client_id` bigint unsigned,
	`due_on` date NOT NULL,
	`note` varchar(255),
	`status` varchar(10) NOT NULL DEFAULT 'open',
	`done_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `follow_ups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `amc_contracts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`contract_no` varchar(30) NOT NULL,
	`installation_id` bigint unsigned NOT NULL,
	`plan` varchar(20) NOT NULL DEFAULT 'comprehensive',
	`start_on` date NOT NULL,
	`end_on` date NOT NULL,
	`visits_per_year` tinyint unsigned NOT NULL DEFAULT 4,
	`filter_change_every_days` smallint unsigned,
	`membrane_change_every_days` smallint unsigned,
	`value` decimal(12,2) NOT NULL DEFAULT '0.00',
	`amount_paid` decimal(12,2) NOT NULL DEFAULT '0.00',
	`payment_status` varchar(10) NOT NULL DEFAULT 'unpaid',
	`status` varchar(10) NOT NULL DEFAULT 'active',
	`renewed_from_id` bigint unsigned,
	`notes` text,
	`created_by` bigint unsigned,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `amc_contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `amc_contracts_contract_no_uq` UNIQUE(`contract_no`)
);
--> statement-breakpoint
CREATE TABLE `client_contacts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`name` varchar(120) NOT NULL,
	`designation` varchar(100),
	`phone` varchar(20) NOT NULL,
	`alt_phone` varchar(20),
	`email` varchar(191),
	`is_primary` boolean NOT NULL DEFAULT false,
	`sms_opt_in` boolean NOT NULL DEFAULT true,
	`opted_out_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `client_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_sites` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`label` varchar(100),
	`address_line` varchar(255) NOT NULL,
	`area` varchar(100),
	`city` varchar(100),
	`state` varchar(60),
	`pincode` varchar(10),
	`lat` decimal(10,7),
	`lng` decimal(10,7),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `client_sites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`type` varchar(12) NOT NULL DEFAULT 'company',
	`gst_no` varchar(15),
	`segment` varchar(12),
	`tags` json,
	`source` varchar(50),
	`sales_owner_id` bigint unsigned,
	`status` varchar(10) NOT NULL DEFAULT 'active',
	`notes` text,
	`created_by` bigint unsigned,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `complaints` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`ticket_no` varchar(20) NOT NULL,
	`installation_id` bigint unsigned NOT NULL,
	`client_id` bigint unsigned NOT NULL,
	`issue` text NOT NULL,
	`priority` varchar(10) NOT NULL DEFAULT 'normal',
	`status` varchar(12) NOT NULL DEFAULT 'open',
	`assigned_to` bigint unsigned,
	`due_by` datetime(3),
	`resolved_at` datetime(3),
	`closed_at` datetime(3),
	`resolution_notes` text,
	`created_by` bigint unsigned,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `complaints_id` PRIMARY KEY(`id`),
	CONSTRAINT `complaints_ticket_no_uq` UNIQUE(`ticket_no`)
);
--> statement-breakpoint
CREATE TABLE `installations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`site_id` bigint unsigned NOT NULL,
	`plant_type` varchar(50),
	`capacity_lph` int unsigned,
	`model` varchar(100),
	`serial_no` varchar(100),
	`membrane_spec` varchar(150),
	`specs` json,
	`installed_on` date,
	`installed_by` bigint unsigned,
	`warranty_until` date,
	`status` varchar(10) NOT NULL DEFAULT 'active',
	`notes` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `installations_id` PRIMARY KEY(`id`),
	CONSTRAINT `installations_serial_no_uq` UNIQUE(`serial_no`)
);
--> statement-breakpoint
CREATE TABLE `service_visits` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`installation_id` bigint unsigned NOT NULL,
	`contract_id` bigint unsigned,
	`complaint_id` bigint unsigned,
	`type` varchar(15) NOT NULL,
	`technician_id` bigint unsigned,
	`due_on` date NOT NULL,
	`scheduled_at` datetime(3),
	`done_at` datetime(3),
	`status` varchar(12) NOT NULL DEFAULT 'scheduled',
	`notes` text,
	`parts_used` json,
	`photo_key` varchar(255),
	`next_due_on` date,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `service_visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sms_batches` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`template_id` bigint unsigned NOT NULL,
	`audience_filter` json,
	`variables` json,
	`scheduled_at` datetime(3),
	`status` varchar(10) NOT NULL DEFAULT 'draft',
	`recipient_count` int unsigned NOT NULL DEFAULT 0,
	`created_by` bigint unsigned,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `sms_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sms_messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`template_id` bigint unsigned,
	`batch_id` bigint unsigned,
	`client_id` bigint unsigned,
	`contact_id` bigint unsigned,
	`employee_id` bigint unsigned,
	`phone` varchar(20) NOT NULL,
	`body` text NOT NULL,
	`ref_type` varchar(30),
	`ref_id` bigint unsigned,
	`dedupe_key` varchar(150),
	`provider` varchar(10) NOT NULL,
	`provider_msg_id` varchar(100),
	`status` varchar(10) NOT NULL DEFAULT 'queued',
	`error` varchar(255),
	`attempts` tinyint unsigned NOT NULL DEFAULT 0,
	`scheduled_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`sent_at` datetime(3),
	`delivered_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `sms_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `sms_messages_dedupe_key_uq` UNIQUE(`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `sms_templates` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`key` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`body` text NOT NULL,
	`variables` json NOT NULL,
	`trigger` varchar(30) NOT NULL DEFAULT 'manual',
	`offset_days` json,
	`audience` varchar(25) NOT NULL DEFAULT 'client',
	`provider_template_id` varchar(50),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `sms_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `sms_templates_key_uq` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` varchar(100) NOT NULL,
	`value` json NOT NULL,
	`updated_by` bigint unsigned,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `app_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`actor_id` bigint unsigned,
	`table_name` varchar(64) NOT NULL,
	`record_id` bigint unsigned NOT NULL,
	`action` varchar(10) NOT NULL,
	`before` json,
	`after` json,
	`reason` varchar(255),
	`ip` varchar(45),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `auth_accounts` ADD CONSTRAINT `auth_accounts_user_id_auth_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_auth_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `departments` ADD CONSTRAINT `departments_head_employee_id_employees_id_fk` FOREIGN KEY (`head_employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_documents` ADD CONSTRAINT `employee_documents_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_documents` ADD CONSTRAINT `employee_documents_uploaded_by_employees_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_locations` ADD CONSTRAINT `employee_locations_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employee_locations` ADD CONSTRAINT `employee_locations_location_id_office_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `office_locations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_department_id_departments_id_fk` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_manager_id_employees_id_fk` FOREIGN KEY (`manager_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_leave_policy_id_leave_policies_id_fk` FOREIGN KEY (`leave_policy_id`) REFERENCES `leave_policies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_user_id_auth_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_check_in_location_id_office_locations_id_fk` FOREIGN KEY (`check_in_location_id`) REFERENCES `office_locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_leave_request_id_leave_requests_id_fk` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_updated_by_employees_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `regularisations` ADD CONSTRAINT `regularisations_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `regularisations` ADD CONSTRAINT `regularisations_attendance_id_attendance_id_fk` FOREIGN KEY (`attendance_id`) REFERENCES `attendance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `regularisations` ADD CONSTRAINT `regularisations_decided_by_employees_id_fk` FOREIGN KEY (`decided_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_balance_adjustments` ADD CONSTRAINT `leave_balance_adjustments_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_balance_adjustments` ADD CONSTRAINT `leave_balance_adjustments_leave_type_id_leave_types_id_fk` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_balance_adjustments` ADD CONSTRAINT `leave_balance_adjustments_created_by_employees_id_fk` FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_balances` ADD CONSTRAINT `leave_balances_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_balances` ADD CONSTRAINT `leave_balances_leave_type_id_leave_types_id_fk` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_policy_types` ADD CONSTRAINT `leave_policy_types_policy_id_leave_policies_id_fk` FOREIGN KEY (`policy_id`) REFERENCES `leave_policies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_policy_types` ADD CONSTRAINT `leave_policy_types_leave_type_id_leave_types_id_fk` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_leave_type_id_leave_types_id_fk` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_approver_id_employees_id_fk` FOREIGN KEY (`approver_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `field_visits` ADD CONSTRAINT `field_visits_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `field_visits` ADD CONSTRAINT `field_visits_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `field_visits` ADD CONSTRAINT `field_visits_site_id_client_sites_id_fk` FOREIGN KEY (`site_id`) REFERENCES `client_sites`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `field_visits` ADD CONSTRAINT `field_visits_reviewed_by_employees_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `field_visits` ADD CONSTRAINT `field_visits_service_visit_id_service_visits_id_fk` FOREIGN KEY (`service_visit_id`) REFERENCES `service_visits`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_field_visit_id_field_visits_id_fk` FOREIGN KEY (`field_visit_id`) REFERENCES `field_visits`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `amc_contracts` ADD CONSTRAINT `amc_contracts_installation_id_installations_id_fk` FOREIGN KEY (`installation_id`) REFERENCES `installations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `amc_contracts` ADD CONSTRAINT `amc_contracts_renewed_from_id_amc_contracts_id_fk` FOREIGN KEY (`renewed_from_id`) REFERENCES `amc_contracts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `amc_contracts` ADD CONSTRAINT `amc_contracts_created_by_employees_id_fk` FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_contacts` ADD CONSTRAINT `client_contacts_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `client_sites` ADD CONSTRAINT `client_sites_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clients` ADD CONSTRAINT `clients_sales_owner_id_employees_id_fk` FOREIGN KEY (`sales_owner_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clients` ADD CONSTRAINT `clients_created_by_employees_id_fk` FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_installation_id_installations_id_fk` FOREIGN KEY (`installation_id`) REFERENCES `installations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_assigned_to_employees_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_created_by_employees_id_fk` FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `installations` ADD CONSTRAINT `installations_site_id_client_sites_id_fk` FOREIGN KEY (`site_id`) REFERENCES `client_sites`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `installations` ADD CONSTRAINT `installations_installed_by_employees_id_fk` FOREIGN KEY (`installed_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_visits` ADD CONSTRAINT `service_visits_installation_id_installations_id_fk` FOREIGN KEY (`installation_id`) REFERENCES `installations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_visits` ADD CONSTRAINT `service_visits_contract_id_amc_contracts_id_fk` FOREIGN KEY (`contract_id`) REFERENCES `amc_contracts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_visits` ADD CONSTRAINT `service_visits_complaint_id_complaints_id_fk` FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_visits` ADD CONSTRAINT `service_visits_technician_id_employees_id_fk` FOREIGN KEY (`technician_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_batches` ADD CONSTRAINT `sms_batches_template_id_sms_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `sms_templates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_batches` ADD CONSTRAINT `sms_batches_created_by_employees_id_fk` FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_messages` ADD CONSTRAINT `sms_messages_template_id_sms_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `sms_templates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_messages` ADD CONSTRAINT `sms_messages_batch_id_sms_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `sms_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_messages` ADD CONSTRAINT `sms_messages_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_messages` ADD CONSTRAINT `sms_messages_contact_id_client_contacts_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `client_contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_messages` ADD CONSTRAINT `sms_messages_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `app_settings` ADD CONSTRAINT `app_settings_updated_by_employees_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actor_id_employees_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_accounts_user_idx` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_verifications_identifier_idx` ON `auth_verifications` (`identifier`);--> statement-breakpoint
CREATE INDEX `employees_status_role_idx` ON `employees` (`status`,`role`);--> statement-breakpoint
CREATE INDEX `attendance_date_status_idx` ON `attendance` (`date`,`status`);--> statement-breakpoint
CREATE INDEX `regularisations_employee_date_idx` ON `regularisations` (`employee_id`,`date`);--> statement-breakpoint
CREATE INDEX `regularisations_status_idx` ON `regularisations` (`status`);--> statement-breakpoint
CREATE INDEX `leave_adjustments_employee_year_idx` ON `leave_balance_adjustments` (`employee_id`,`year`);--> statement-breakpoint
CREATE INDEX `leave_requests_employee_from_idx` ON `leave_requests` (`employee_id`,`from_date`);--> statement-breakpoint
CREATE INDEX `leave_requests_status_from_idx` ON `leave_requests` (`status`,`from_date`);--> statement-breakpoint
CREATE INDEX `field_visits_employee_logged_idx` ON `field_visits` (`employee_id`,`logged_at`);--> statement-breakpoint
CREATE INDEX `field_visits_status_logged_idx` ON `field_visits` (`status`,`logged_at`);--> statement-breakpoint
CREATE INDEX `follow_ups_employee_status_due_idx` ON `follow_ups` (`employee_id`,`status`,`due_on`);--> statement-breakpoint
CREATE INDEX `amc_contracts_status_end_idx` ON `amc_contracts` (`status`,`end_on`);--> statement-breakpoint
CREATE INDEX `client_contacts_phone_idx` ON `client_contacts` (`phone`);--> statement-breakpoint
CREATE INDEX `client_sites_city_area_idx` ON `client_sites` (`city`,`area`);--> statement-breakpoint
CREATE INDEX `clients_name_idx` ON `clients` (`name`);--> statement-breakpoint
CREATE INDEX `clients_status_idx` ON `clients` (`status`);--> statement-breakpoint
CREATE INDEX `complaints_status_priority_idx` ON `complaints` (`status`,`priority`);--> statement-breakpoint
CREATE INDEX `installations_warranty_until_idx` ON `installations` (`warranty_until`);--> statement-breakpoint
CREATE INDEX `service_visits_status_due_idx` ON `service_visits` (`status`,`due_on`);--> statement-breakpoint
CREATE INDEX `service_visits_technician_due_idx` ON `service_visits` (`technician_id`,`due_on`);--> statement-breakpoint
CREATE INDEX `sms_batches_status_scheduled_idx` ON `sms_batches` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `sms_messages_status_scheduled_idx` ON `sms_messages` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `sms_messages_client_created_idx` ON `sms_messages` (`client_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sms_messages_ref_idx` ON `sms_messages` (`ref_type`,`ref_id`);--> statement-breakpoint
CREATE INDEX `sms_messages_provider_msg_idx` ON `sms_messages` (`provider_msg_id`);--> statement-breakpoint
CREATE INDEX `audit_log_record_idx` ON `audit_log` (`table_name`,`record_id`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_created_idx` ON `audit_log` (`actor_id`,`created_at`);
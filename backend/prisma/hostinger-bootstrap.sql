-- Bootstrap schema generated from backend/prisma/migrations in chronological order.
-- Import only into the new, empty Hostinger database for this application.
-- The migration history at the end records these exact migration checksums.

-- Migration: 20260603054718_init
-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'user',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_settings` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conference_info` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `speakers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `bio` TEXT NULL,
    `image` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `room` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `abstract_submissions` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `registrations` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `registrationType` VARCHAR(191) NOT NULL DEFAULT 'standard',
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `couponCode` VARCHAR(191) NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `discount` DECIMAL(65, 30) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `maxUses` INTEGER NULL,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `coupons_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_SessionToSpeaker` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`A`, `B`),
    INDEX `_SessionToSpeaker_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `abstract_submissions` ADD CONSTRAINT `abstract_submissions_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_SessionToSpeaker` ADD CONSTRAINT `_SessionToSpeaker_A_fkey` FOREIGN KEY (`A`) REFERENCES `sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_SessionToSpeaker` ADD CONSTRAINT `_SessionToSpeaker_B_fkey` FOREIGN KEY (`B`) REFERENCES `speakers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration: 20260604120000_app_content_tables
-- Local app tables for site content and app metadata.

CREATE TABLE IF NOT EXISTS `site_data` (
  `id` VARCHAR(191) NOT NULL DEFAULT (UUID()),
  `data_key` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `value` LONGTEXT NULL,
  `value_type` VARCHAR(64) NULL DEFAULT 'text',
  `group_name` VARCHAR(191) NULL,
  `is_public` BOOLEAN NULL DEFAULT true,
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `site_data_data_key_key` (`data_key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `website_content` (
  `id` VARCHAR(191) NOT NULL DEFAULT (UUID()),
  `section_key` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NULL,
  `content` LONGTEXT NULL,
  `metadata` JSON NULL,
  `updated_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `website_content_section_key_key` (`section_key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `media_partners` (
  `id` VARCHAR(191) NOT NULL DEFAULT (UUID()),
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `logo_url` TEXT NULL,
  `website_url` TEXT NULL,
  `tier` VARCHAR(191) NULL,
  `display_order` INT NULL DEFAULT 0,
  `is_visible` BOOLEAN NULL DEFAULT true,
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `information_blocks` (
  `id` VARCHAR(191) NOT NULL DEFAULT (UUID()),
  `title` VARCHAR(191) NOT NULL,
  `subtitle` VARCHAR(191) NULL,
  `content` LONGTEXT NULL,
  `category` VARCHAR(191) NULL,
  `cta_label` VARCHAR(191) NULL,
  `cta_url` TEXT NULL,
  `display_order` INT NULL DEFAULT 0,
  `is_visible` BOOLEAN NULL DEFAULT true,
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id` VARCHAR(191) NOT NULL DEFAULT (UUID()),
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `message` LONGTEXT NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'new',
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `registration_intents` (
  `id` VARCHAR(191) NOT NULL DEFAULT (UUID()),
  `full_name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NOT NULL,
  `country` VARCHAR(191) NULL,
  `affiliation` VARCHAR(191) NULL,
  `designation` VARCHAR(191) NULL,
  `plan_key` VARCHAR(191) NOT NULL,
  `plan_name` VARCHAR(191) NOT NULL,
  `amount_usd` DECIMAL(10, 2) NOT NULL,
  `currency` VARCHAR(16) NOT NULL DEFAULT 'USD',
  `payment_provider` VARCHAR(64) NOT NULL,
  `payment_status` VARCHAR(64) NOT NULL DEFAULT 'pending',
  `payment_reference` VARCHAR(191) NULL,
  `payment_session_id` VARCHAR(191) NULL,
  `payment_order_id` VARCHAR(191) NULL,
  `gateway_response` JSON NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'pending',
  `notes` LONGTEXT NULL,
  `redirect_url` TEXT NULL,
  `redirected_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `cancelled_at` DATETIME(3) NULL,
  `coupon_code` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `coupon_codes` (
  `id` VARCHAR(191) NOT NULL DEFAULT (UUID()),
  `code` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `discount_percent` DECIMAL(5, 2) NULL,
  `discount_amount` DECIMAL(10, 2) NULL,
  `max_uses` INT NULL,
  `current_uses` INT NULL DEFAULT 0,
  `is_active` BOOLEAN NULL DEFAULT true,
  `valid_from` DATETIME(3) NULL,
  `valid_until` DATETIME(3) NULL,
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `coupon_codes_code_key` (`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `speakers`
  MODIFY COLUMN `email` VARCHAR(191) NULL,
  ADD COLUMN `organization` VARCHAR(191) NULL,
  ADD COLUMN `topic` TEXT NULL,
  ADD COLUMN `image_url` TEXT NULL,
  ADD COLUMN `session_type` VARCHAR(191) NULL,
  ADD COLUMN `display_order` INT NULL DEFAULT 0,
  ADD COLUMN `is_visible` BOOLEAN NULL DEFAULT true,
  ADD COLUMN `updated_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  ADD COLUMN `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `abstract_submissions`
  MODIFY COLUMN `authorId` VARCHAR(191) NULL,
  MODIFY COLUMN `title` VARCHAR(191) NULL,
  MODIFY COLUMN `description` TEXT NULL,
  MODIFY COLUMN `updatedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  ADD COLUMN `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `full_name` VARCHAR(191) NULL,
  ADD COLUMN `email` VARCHAR(191) NULL,
  ADD COLUMN `phone` VARCHAR(191) NULL,
  ADD COLUMN `affiliation` VARCHAR(191) NULL,
  ADD COLUMN `country` VARCHAR(191) NULL,
  ADD COLUMN `abstract_title` VARCHAR(191) NULL,
  ADD COLUMN `abstract_text` LONGTEXT NULL,
  ADD COLUMN `presentation_type` VARCHAR(191) NULL,
  ADD COLUMN `keywords` TEXT NULL,
  ADD COLUMN `supporting_text` LONGTEXT NULL,
  ADD COLUMN `drive_url` TEXT NULL,
  ADD COLUMN `website_url` TEXT NULL,
  ADD COLUMN `file_paths` JSON NULL,
  ADD COLUMN `voice_file_name` VARCHAR(191) NULL,
  ADD COLUMN `voice_file_path` TEXT NULL;

-- Migration: 20260830090000_add_abstract_session
ALTER TABLE `abstract_submissions`
  ADD COLUMN IF NOT EXISTS `session` VARCHAR(191) NULL;

-- Migration: 20260927120000_orders_payments
-- Orders and Payments tables for secure, provider-agnostic checkout.
-- An Order is the authoritative internal record (amount snapshot, immutable).
-- A Payment is one attempt against an order; an order can have many attempts.

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `order_number` VARCHAR(191) NOT NULL,
    `registration_id` VARCHAR(191) NOT NULL,
    `access_token` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `base_amount` DECIMAL(10, 2) NOT NULL,
    `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `tax_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `final_amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(16) NOT NULL DEFAULT 'USD',
    `gateway_amount` BIGINT NOT NULL,
    `gateway_currency` VARCHAR(16) NOT NULL,
    `coupon_code` VARCHAR(191) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    `provider_order_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `orders_order_number_key`(`order_number`),
    UNIQUE INDEX `orders_access_token_key`(`access_token`),
    UNIQUE INDEX `orders_provider_order_id_key`(`provider_order_id`),
    INDEX `orders_registration_id_idx`(`registration_id`),
    INDEX `orders_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `provider_payment_id` VARCHAR(191) NULL,
    `provider_order_id` VARCHAR(191) NULL,
    `provider_signature` VARCHAR(255) NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(16) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    `method` VARCHAR(64) NULL,
    `error_code` VARCHAR(128) NULL,
    `error_description` TEXT NULL,
    `event_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payments_provider_payment_id_key`(`provider_payment_id`),
    UNIQUE INDEX `payments_event_id_key`(`event_id`),
    INDEX `payments_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration: 20261001100000_checkout_quantity
ALTER TABLE `registration_intents`
  ADD COLUMN `quantity` INT NOT NULL DEFAULT 1;

ALTER TABLE `orders`
  ADD COLUMN `quantity` INT NOT NULL DEFAULT 1;

-- Migration: 20261001110000_refunds_ledger
CREATE TABLE `refunds` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `provider_refund_id` VARCHAR(191) NULL,
    `provider_payment_id` VARCHAR(191) NOT NULL,
    `amount_minor` BIGINT NOT NULL,
    `currency` VARCHAR(16) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    `event_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refunds_provider_refund_id_key`(`provider`, `provider_refund_id`),
    UNIQUE INDEX `refunds_provider_event_id_key`(`provider`, `event_id`),
    INDEX `refunds_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `refunds_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migration: 20261001120000_payment_audit_log
CREATE TABLE `payment_audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `provider` VARCHAR(32) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `previous_status` VARCHAR(32) NULL,
    `new_status` VARCHAR(32) NULL,
    `amount_minor` BIGINT NULL,
    `currency` VARCHAR(16) NULL,
    `provider_reference` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payment_audit_logs_order_created_idx`(`order_id`, `created_at`),
    INDEX `payment_audit_logs_actor_created_idx`(`actor_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migration: 20261001130000_payment_notification_outbox
CREATE TABLE `payment_notifications` (
    `id` VARCHAR(191) NOT NULL,
    `registration_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(64) NOT NULL DEFAULT 'PAYMENT_CONFIRMED',
    `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    `attempts` INT NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payment_notifications_registration_type_key`(`registration_id`, `type`),
    INDEX `payment_notifications_status_next_attempt_idx`(`status`, `next_attempt_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migration: 20261001140000_payment_gateway_transaction_amount
ALTER TABLE `payments`
    ADD COLUMN `gateway_amount` BIGINT NULL,
    ADD COLUMN `gateway_currency` VARCHAR(191) NULL;

UPDATE `payments` AS p
INNER JOIN `orders` AS o
    ON o.`id` = p.`order_id`
SET
    p.`gateway_amount` = o.`gateway_amount`,
    p.`gateway_currency` = o.`gateway_currency`
WHERE p.`status` = 'SUCCESS'
  AND p.`provider` = o.`provider`
  AND p.`provider_order_id` = o.`provider_order_id`;

-- Migration: 20261002170000_speaker_profile_fields
ALTER TABLE `speakers`
  ADD COLUMN `website_url` TEXT NULL,
  ADD COLUMN `linkedin_url` TEXT NULL,
  ADD COLUMN `twitter_url` TEXT NULL;

-- Migration: 20261002180000_accommodation_checkout
CREATE TABLE `accommodation_options` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `price_per_night` DECIMAL(10, 2) NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
  `available_from` DATE NULL,
  `available_until` DATE NULL,
  `minimum_nights` INT NOT NULL DEFAULT 1,
  `maximum_nights` INT NULL,
  `capacity` INT NULL,
  `allow_outside_conference_dates` BOOLEAN NOT NULL DEFAULT false,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `accommodation_options_is_active_idx` (`is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `registration_intents`
  ADD COLUMN `accommodation_option_id` VARCHAR(191) NULL,
  ADD COLUMN `accommodation_check_in` DATE NULL,
  ADD COLUMN `accommodation_check_out` DATE NULL;

ALTER TABLE `orders`
  ADD COLUMN `accommodation_option_id` VARCHAR(191) NULL,
  ADD COLUMN `accommodation_name` VARCHAR(191) NULL,
  ADD COLUMN `accommodation_check_in` DATE NULL,
  ADD COLUMN `accommodation_check_out` DATE NULL,
  ADD COLUMN `accommodation_nights` INT NULL,
  ADD COLUMN `accommodation_price_per_night` DECIMAL(10, 2) NULL,
  ADD COLUMN `accommodation_total` DECIMAL(10, 2) NULL,
  ADD INDEX `orders_accommodation_capacity_idx`
    (`accommodation_option_id`, `status`, `accommodation_check_in`, `accommodation_check_out`);

-- Migration: 20261011010000_email_notification_outbox
CREATE TABLE `email_notifications` (
    `id` VARCHAR(191) NOT NULL,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `recipient` VARCHAR(320) NOT NULL,
    `payload` LONGTEXT NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    `attempts` INT NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `email_notifications_dedupe_key_key`(`dedupe_key`),
    INDEX `email_notifications_status_next_attempt_idx`(`status`, `next_attempt_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Prisma migration history; checksums are SHA-256 of the source migration.sql files.
CREATE TABLE `_prisma_migrations` (
  `id` VARCHAR(36) NOT NULL,
  `checksum` VARCHAR(64) NOT NULL,
  `finished_at` DATETIME(3) NULL,
  `migration_name` VARCHAR(255) NOT NULL,
  `logs` TEXT NULL,
  `rolled_back_at` DATETIME(3) NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `_prisma_migrations` (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`) VALUES
('564f94a4-e201-47b8-b100-60cfcf0a3afc', '20e8ce065ff7aea3127b8008a467f500b8d87b796ce6fe667f30ab5327b4be1e', '2026-06-03 05:47:18.000', '20260603054718_init', NULL, NULL, '2026-06-03 05:47:18.000', 1),
('86af0125-c961-4d14-9c4f-c02c9cd0b070', '4b552eb40204a9b0928bd84688c71b24bac46f50cd80fe7a9ddbcbea354c459e', '2026-06-04 12:00:00.000', '20260604120000_app_content_tables', NULL, NULL, '2026-06-04 12:00:00.000', 1),
('73176960-9623-48c6-a432-af272c71463e', '799c6b31582141c6b86c932ec6ca8a58804d562a85267fbfe5ee6886e52a5ace', '2026-08-30 09:00:00.000', '20260830090000_add_abstract_session', NULL, NULL, '2026-08-30 09:00:00.000', 1),
('9a194902-9342-40dc-be06-2b39849e0cf2', 'a4d5ffa2212abfd4560cd7266083b432e59a3b8c07b83b04f0cc146f8c96678f', '2026-09-27 12:00:00.000', '20260927120000_orders_payments', NULL, NULL, '2026-09-27 12:00:00.000', 1),
('b1b5c16e-4d73-46b9-b1b6-0c7c682d80d6', 'bf6a8ee5e0c7c7480a8456db81ed40e7c489c9507725fe8df2e3d97094dbaf38', '2026-10-01 10:00:00.000', '20261001100000_checkout_quantity', NULL, NULL, '2026-10-01 10:00:00.000', 1),
('d78dc44e-2e35-44e9-a05d-664f205943dd', '6b2a87d0f41e69abe236e3ffd9fe266c297d09a999f841ba0a6b59cb60cd9959', '2026-10-01 11:00:00.000', '20261001110000_refunds_ledger', NULL, NULL, '2026-10-01 11:00:00.000', 1),
('7d46c83b-9b71-4181-b251-c1540e9cd8a8', '57b4e494aaf7d9d056f49b7ced4c830b7702331fa142bdba79f9ed3e43b402a0', '2026-10-01 12:00:00.000', '20261001120000_payment_audit_log', NULL, NULL, '2026-10-01 12:00:00.000', 1),
('d38c9212-de7b-46d5-a574-45be92f25a68', 'ef8e0373b368ccf2014b51e682820c8e07ea1733322a53204015bd86f76aa35f', '2026-10-01 13:00:00.000', '20261001130000_payment_notification_outbox', NULL, NULL, '2026-10-01 13:00:00.000', 1),
('32785db9-7775-4d61-abd6-f359a573d0bc', '0826810acc4c35dad0bb8c776a2d872331857beb414659bf2da50d8f1181d73c', '2026-10-01 14:00:00.000', '20261001140000_payment_gateway_transaction_amount', NULL, NULL, '2026-10-01 14:00:00.000', 1),
('58eb1eed-1e80-4a0c-a09f-612d4e2159fb', '6446d073e10db05689640d906d7d5bec3cfebdd4aaa4040ca0fab293f76c1396', '2026-10-02 17:00:00.000', '20261002170000_speaker_profile_fields', NULL, NULL, '2026-10-02 17:00:00.000', 1),
('e6300ae2-a814-42ee-97c6-6e2a16d0f23e', '1d9fc97f4ceba210e49aefcb43f564e91727660b2fcd899989de82193e3618f3', '2026-10-02 18:00:00.000', '20261002180000_accommodation_checkout', NULL, NULL, '2026-10-02 18:00:00.000', 1),
('16386f6c-85ba-4f3d-afd4-f02e3156cde5', '2665e27d80ad64a40e6301f84a0f002f31cf744b0714e55e948ad72dbb45800d', '2026-10-11 01:00:00.000', '20261011010000_email_notification_outbox', NULL, NULL, '2026-10-11 01:00:00.000', 1);

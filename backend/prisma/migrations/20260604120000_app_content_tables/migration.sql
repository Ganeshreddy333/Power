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

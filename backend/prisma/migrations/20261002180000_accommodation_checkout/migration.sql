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

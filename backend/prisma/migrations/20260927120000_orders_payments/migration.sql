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

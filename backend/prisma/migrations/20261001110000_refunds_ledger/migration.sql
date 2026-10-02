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

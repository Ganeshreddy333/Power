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

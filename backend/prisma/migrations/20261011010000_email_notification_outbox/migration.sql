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

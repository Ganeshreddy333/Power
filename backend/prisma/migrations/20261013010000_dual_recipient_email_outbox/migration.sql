ALTER TABLE `email_notifications`
    ADD COLUMN `recipient_role` VARCHAR(16) NOT NULL DEFAULT 'USER' AFTER `recipient`;

INSERT IGNORE INTO `email_notifications`
    (`id`, `dedupe_key`, `type`, `recipient`, `recipient_role`, `payload`, `status`, `attempts`,
     `last_error`, `next_attempt_at`, `sent_at`, `created_at`, `updated_at`)
SELECT
    CONCAT('legacy-payment-', pn.`id`),
    CONCAT('PAYMENT_CONFIRMED:', pn.`registration_id`),
    'PAYMENT_CONFIRMED',
    r.`email`,
    'USER',
    CONCAT('{"registrationId":"', pn.`registration_id`, '"}'),
    CASE WHEN pn.`status` = 'SENDING' THEN 'FAILED' ELSE pn.`status` END,
    pn.`attempts`,
    pn.`last_error`,
    pn.`next_attempt_at`,
    pn.`sent_at`,
    pn.`created_at`,
    pn.`updated_at`
FROM `payment_notifications` AS pn
JOIN `registration_intents` AS r ON r.`id` = pn.`registration_id`
WHERE r.`email` IS NOT NULL AND r.`email` <> '';

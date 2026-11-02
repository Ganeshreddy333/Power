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

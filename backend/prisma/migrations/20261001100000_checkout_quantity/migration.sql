ALTER TABLE `registration_intents`
  ADD COLUMN `quantity` INT NOT NULL DEFAULT 1;

ALTER TABLE `orders`
  ADD COLUMN `quantity` INT NOT NULL DEFAULT 1;

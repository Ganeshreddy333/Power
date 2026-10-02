ALTER TABLE `abstract_submissions`
  ADD COLUMN IF NOT EXISTS `session` VARCHAR(191) NULL;

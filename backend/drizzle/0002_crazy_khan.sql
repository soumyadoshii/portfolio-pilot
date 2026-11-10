ALTER TABLE `portfolio_states` ADD `riskProfile` varchar(64);--> statement-breakpoint
ALTER TABLE `portfolio_states` ADD `riskScore` int;--> statement-breakpoint
ALTER TABLE `portfolio_states` ADD `riskTier` varchar(64);--> statement-breakpoint
ALTER TABLE `portfolio_states` ADD `archetype` varchar(128);--> statement-breakpoint
ALTER TABLE `portfolio_states` ADD `preferencesJson` text;
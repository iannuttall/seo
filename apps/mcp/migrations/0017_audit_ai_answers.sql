-- ai_answers is the latest weekly AI answer check of a site, pushed by the
-- site object (WeekAiAnswers in packages/core/src/commands/week.ts, built
-- by audit/ai-answers.ts), so the weekly summary never wakes it. Its
-- DataForSEO spend is counted as included_dataforseo_microusd, like the
-- competitor check's (migrations/0013_audit_competitors.sql).

ALTER TABLE audit_sites ADD COLUMN ai_answers TEXT;

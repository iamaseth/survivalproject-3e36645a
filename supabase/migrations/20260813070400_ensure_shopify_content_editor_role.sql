-- Keep this separate from the roster migration because PostgreSQL enum values
-- added in a transaction cannot safely be used by subsequent statements until
-- that transaction commits.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'shopify_content_editor';

-- Keep the admin audit log readable only by authorized admins.
-- The existing admin_audit_log_admin_read RLS policy remains the row-level gate.
GRANT SELECT ON TABLE public.admin_audit_log TO authenticated;

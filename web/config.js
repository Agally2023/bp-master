// Public configuration (safe to publish: the publishable key only identifies the project; access is enforced by row level security + MFA).
window.BPM_CONFIG = {
  SUPABASE_URL: 'https://gtokqbahkdjwyasagosi.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_9CQAwg_g5Ljl7tlximwxKQ_n9oYwisL',
  REPORT_API_URL: 'https://bp-master-report.onrender.com/report',   // PPT service (Render Blueprint: render.yaml)
  IDLE_LOGOUT_MINUTES: 15,
  MFA_REQUIRED: false,           // two-step verification is OFF for now; set true (and run supabase/mfa_on.sql) to re-enable
};

/* Supabase project shared by the invoice portal and the booking portal (one login for both).
   The publishable (anon) key is meant to be public: the database rules (RLS) decide what it can do.
   Never put a secret / service_role key here. */
window.BOOKING_CONFIG = {
  url: 'https://kknmrxopxnhirntmnwhb.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrbm1yeG9weG5oaXJudG1ud2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNzIzNTMsImV4cCI6MjEwMzg0ODM1M30.XU-WKnn--on-UKwaSWAVMNG3mZCCO4QOenobrEXKf2s'
};

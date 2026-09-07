(() => {
  if (!window.supabase) throw new Error("Supabase library failed to load.");
  const cfg = window.APP_CONFIG;
  window.sb = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();

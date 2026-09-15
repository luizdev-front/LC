(function(){
  const cfg = window.LC_CONFIG || {};
  const configured =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("COLE_AQUI") &&
    !cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI");

  window.LC_SUPABASE_CONFIGURED = Boolean(configured);

  if (!configured) {
    window.lcSupabase = null;
    console.warn("LC Commerce: Supabase ainda não configurado em js/config.js");
    return;
  }

  window.lcSupabase = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();
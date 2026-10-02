export const config = Object.freeze({
  supabaseUrl: "https://zdlxhjizheakyrohnohc.supabase.co",
  // This must be a public anon key or publishable key, never a secret/service-role key.
  supabaseAnonKey: "sb_publishable_Rh0417nH3OtOcgvG6pqrSQ_A9gC4s5N",
  portraitPath: "assets/images/identity/BackgroundEraser_20261001_212350469.png"
});

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
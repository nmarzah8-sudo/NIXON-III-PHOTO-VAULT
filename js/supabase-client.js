import { config, isSupabaseConfigured } from "./config.js";

const SUPABASE_JS_MODULE = "https://esm.sh/@supabase/supabase-js@2";
let clientPromise;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error("Set the Supabase URL and public anon/publishable key in js/config.js before connecting."));
  }

  if (!clientPromise) {
    clientPromise = import(SUPABASE_JS_MODULE)
      .then(({ createClient }) => createClient(config.supabaseUrl, config.supabaseAnonKey))
      .catch((error) => {
        clientPromise = undefined;
        throw error;
      });
  }

  return clientPromise;
}

<?php
// Copy to config.php on the server and fill in. NEVER commit config.php or put it in a ZIP.
return [
  // Public Supabase values (same as the website's):
  'supabase_url'      => 'https://YOUR_PROJECT.supabase.co',
  'supabase_anon_key' => 'YOUR_SUPABASE_ANON_KEY',
  // AI provider (any OpenAI-compatible chat completions API). Server-side secret:
  'ai_base_url' => 'https://YOUR_PROVIDER/v1',
  'ai_api_key'  => 'YOUR_PROVIDER_KEY',
  'ai_model'    => 'YOUR_MODEL_NAME',
  // Limits per signed-in user:
  'rate_per_minute' => 12,
  'rate_per_day'    => 200,
  // Origin of your website, for example https://yoursite.rf.gd . Leave '' for same-origin only.
  'allowed_origin' => '',
];

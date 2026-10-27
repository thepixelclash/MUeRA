<?php
// MUeRA AI endpoint for PHP hosting (for example InfinityFree).
// Verifies the Supabase sign-in token, rate limits per user, validates the request,
// then calls an OpenAI-compatible provider with the key kept in config.php (server-side only).
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): void {
  http_response_code($status);
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) respond(503, ['error' => 'AI is not configured on the server.', 'status' => 503]);
$cfg = require $configPath;
foreach (['supabase_url', 'supabase_anon_key', 'ai_base_url', 'ai_api_key', 'ai_model'] as $k) {
  $v = (string)($cfg[$k] ?? '');
  if ($v === '' || stripos($v, 'YOUR_') !== false)
    respond(503, ['error' => 'AI is not configured on the server.', 'status' => 503]);
}

// CORS: same-origin by default. Only one explicit origin can be allowed.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = (string)($cfg['allowed_origin'] ?? '');
if ($origin !== '') {
  if ($allowed !== '' && hash_equals($allowed, $origin)) {
    header('Access-Control-Allow-Origin: ' . $allowed);
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Authorization, X-Session-Token, Content-Type');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
  } elseif (parse_url($origin, PHP_URL_HOST) !== ($_SERVER['HTTP_HOST'] ?? '')) {
    respond(403, ['error' => 'Origin not allowed.', 'status' => 403]);
  }
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') respond(405, ['error' => 'Use POST.', 'status' => 405]);

// Request validation.
$raw = file_get_contents('php://input', false, null, 0, 60000);
if ($raw === false || strlen($raw) >= 60000) respond(413, ['error' => 'Request too large.', 'status' => 413]);
$in = json_decode($raw, true);
if (!is_array($in)) respond(400, ['error' => 'Invalid JSON.', 'status' => 400]);
$prompts = require __DIR__ . '/prompts.php';
$mode = $in['mode'] ?? '';
$prompt = $in['prompt'] ?? '';
$context = $in['context'] ?? '';
if (!is_string($mode) || !isset($prompts[$mode])) respond(400, ['error' => 'Unknown mode.', 'status' => 400]);
if (!is_string($prompt) || $prompt === '' || mb_strlen($prompt) > 4000) respond(400, ['error' => 'Prompt must be 1-4000 characters.', 'status' => 400]);
if (!is_string($context) || mb_strlen($context) > 30000) respond(400, ['error' => 'Context too long.', 'status' => 400]);

// Verify the Supabase session token. The user id comes from Supabase, never from the client body.
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if ($auth === '' && function_exists('getallheaders')) {
  foreach (getallheaders() as $hk => $hv) if (strcasecmp($hk, 'Authorization') === 0) $auth = $hv;
}
$token = (stripos($auth, 'Bearer ') === 0) ? trim(substr($auth, 7)) : '';
// Some shared hosts strip the Authorization header before PHP sees it; the app also sends the same token here.
if ($token === '') $token = trim((string)($_SERVER['HTTP_X_SESSION_TOKEN'] ?? ''));
if ($token === '' || strlen($token) > 4000) respond(401, ['error' => 'Please sign in to use AI features.', 'status' => 401]);

function http_json(string $url, array $headers, ?string $body, int $timeout): array {
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8,
      CURLOPT_HTTPHEADER => $headers, CURLOPT_FOLLOWLOCATION => false,
    ]);
    if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); curl_setopt($ch, CURLOPT_POSTFIELDS, $body); }
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$code, $resp === false ? '' : (string)$resp];
  }
  $ctx = stream_context_create(['http' => [
    'method' => $body === null ? 'GET' : 'POST', 'header' => implode("\r\n", $headers),
    'content' => $body ?? '', 'timeout' => $timeout, 'ignore_errors' => true,
  ]]);
  $resp = @file_get_contents($url, false, $ctx);
  $code = 0;
  if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) $code = (int)$m[1];
  return [$code, $resp === false ? '' : (string)$resp];
}

[$ucode, $ubody] = http_json(rtrim($cfg['supabase_url'], '/') . '/auth/v1/user', [
  'Authorization: Bearer ' . $token, 'apikey: ' . $cfg['supabase_anon_key'],
], null, 10);
if ($ucode === 0) respond(503, ['error' => 'Could not verify your session. Try again.', 'status' => 503]);
$user = json_decode($ubody, true);
if ($ucode !== 200 || !is_array($user) || empty($user['id']) || !is_string($user['id']))
  respond(401, ['error' => 'Your session expired. Please sign in again.', 'status' => 401]);
$uid = preg_replace('/[^a-zA-Z0-9-]/', '', $user['id']);

// Per-user rate limit (file counters, one file per user).
$dir = __DIR__ . '/ratelimit';
if (!is_dir($dir)) { @mkdir($dir, 0750); @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n"); }
$f = $dir . '/' . $uid . '.json';
$fh = @fopen($f, 'c+');
if ($fh) {
  flock($fh, LOCK_EX);
  $d = json_decode((string)stream_get_contents($fh), true);
  $now = time();
  $hits = (is_array($d) && isset($d['hits']) && is_array($d['hits'])) ? $d['hits'] : [];
  $hits = array_values(array_filter($hits, fn($t) => is_int($t) && $now - $t < 86400));
  $perMin = max(1, (int)($cfg['rate_per_minute'] ?? 12));
  $perDay = max(1, (int)($cfg['rate_per_day'] ?? 200));
  $lastMin = count(array_filter($hits, fn($t) => $now - $t < 60));
  $blocked = null;
  if ($lastMin >= $perMin) $blocked = 'Too many AI requests. Please wait a minute and try again.';
  elseif (count($hits) >= $perDay) $blocked = 'Daily AI limit reached. Non-AI features still work.';
  if ($blocked === null) { $hits[] = $now; ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode(['hits' => $hits])); }
  flock($fh, LOCK_UN); fclose($fh);
  if ($blocked !== null) respond(429, ['error' => $blocked, 'status' => 429]);
}

// Call the AI provider.
$payload = json_encode([
  'model' => $cfg['ai_model'],
  // Extraction tasks need long answers; some models otherwise spend the whole
  // completion on hidden reasoning and return empty content.
  'max_completion_tokens' => 16384,
  'temperature' => 0,
  'messages' => [
    ['role' => 'system', 'content' => $prompts[$mode]],
    ['role' => 'user', 'content' => ($context !== '' ? "CONTEXT:\n" . mb_substr($context, 0, 24000) . "\n\n" : '') . $prompt],
  ],
], JSON_UNESCAPED_UNICODE);
[$acode, $abody] = http_json(rtrim($cfg['ai_base_url'], '/') . '/chat/completions', [
  'Authorization: Bearer ' . $cfg['ai_api_key'], 'Content-Type: application/json',
], $payload, 50);
if ($acode === 0) respond(502, ['error' => 'Could not reach the AI service. Other features still work.', 'status' => 502]);
$a = json_decode($abody, true);
if ($acode !== 200) {
  $msg = is_array($a) ? ($a['error']['message'] ?? $a['message'] ?? 'AI request failed.') : 'AI request failed.';
  if ($acode === 402) $msg = 'AI credits are used up. Non-AI features still work.';
  if ($acode === 429) $msg = 'Too many AI requests right now. Please wait a minute and try again.';
  if (!is_string($msg)) $msg = 'AI request failed.';
  respond($acode >= 400 && $acode < 600 ? $acode : 502, ['error' => $msg, 'status' => $acode]);
}
$text = is_array($a) ? ($a['choices'][0]['message']['content'] ?? '') : '';
if (!is_string($text) || trim($text) === '') respond(502, ['error' => 'The AI returned no answer for this request.', 'status' => 502]);
respond(200, ['text' => $text]);

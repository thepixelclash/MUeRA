import { PHP } from "@php-wasm/universal";
import { loadNodeRuntime } from "@php-wasm/node";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Runs hosting/php-api/ai.php on real PHP 8.3 (WebAssembly build) against local mock Supabase and AI servers.
const dir = fileURLToPath(new URL("../hosting/php-api", import.meta.url));
const php = new PHP(await loadNodeRuntime("8.3", { emscriptenOptions: { processId: 1 } }));
php.mkdir("/app");
for (const f of ["ai.php","prompts.php","config.example.php"]) php.writeFile("/app/"+f, readFileSync(`${dir}/${f}`));
console.log("php", (await php.run({code:"<?php echo PHP_VERSION.' curl='.(function_exists('curl_init')?'y':'n').' fopen='.ini_get('allow_url_fopen');"})).text);
async function call(body, headers={}, method="POST", cfg=null) {
  if (cfg) php.writeFile("/app/config.php", "<?php return "+cfg+";"); else { try{php.unlink("/app/config.php")}catch{} }
  const r = await php.run({ scriptPath:"/app/ai.php", relativeUri:"/ai.php", method, headers:{host:"x.test","content-type":"application/json",...headers}, body: body==null?undefined:new TextEncoder().encode(JSON.stringify(body)) });
  return { status:r.httpStatusCode, body:r.text };
}
const out=[]; const t=(n,c)=>{out.push([n,c]); };
// mock servers
const sup = http.createServer((q,s)=>{ const a=q.headers.authorization; if(a==="Bearer good"){s.end(JSON.stringify({id:"user-1"}));} else {s.statusCode=401;s.end("{}");} }).listen(0);
let aiBody=null; const ai = http.createServer((q,s)=>{ let b="";q.on("data",d=>b+=d);q.on("end",()=>{aiBody={auth:q.headers.authorization,b:JSON.parse(b)};s.setHeader("content-type","application/json");s.end(JSON.stringify({choices:[{message:{content:"hello from mock"}}]}));});}).listen(0);
const cfgOk = `['supabase_url'=>'http://127.0.0.1:${sup.address().port}','supabase_anon_key'=>'anon','ai_base_url'=>'http://127.0.0.1:${ai.address().port}/v1','ai_api_key'=>'SECRETKEY','ai_model'=>'m','rate_per_minute'=>2,'rate_per_day'=>50,'allowed_origin'=>'']`;
let r;
r=await call({mode:"chat",prompt:"hi"},{}, "POST", null); t("no config -> 503", r.status===503 && /not configured/.test(r.body));
r=await call({mode:"chat",prompt:"hi"},{}, "POST", `['supabase_url'=>'https://YOUR_PROJECT.supabase.co']`); t("placeholder config -> 503", r.status===503);
r=await call(null,{}, "GET", cfgOk); t("GET -> 405", r.status===405);
r=await call({mode:"bogus",prompt:"hi"},{}, "POST", cfgOk); t("bad mode -> 400", r.status===400);
r=await call({mode:"chat",prompt:""},{}, "POST", cfgOk); t("empty prompt -> 400", r.status===400);
r=await call({mode:"chat",prompt:"x".repeat(4001)},{}, "POST", cfgOk); t("long prompt -> 400", r.status===400);
r=await call({mode:"chat",prompt:"hi"},{origin:"https://evil.example"}, "POST", cfgOk); t("foreign origin -> 403", r.status===403);
r=await call({mode:"chat",prompt:"hi"},{}, "POST", cfgOk); t("no token -> 401", r.status===401);
r=await call({mode:"chat",prompt:"hi"},{authorization:"Bearer bad"}, "POST", cfgOk); t("bad token -> 401", r.status===401);
r=await call({mode:"chat",prompt:"hi"},{"x-session-token":"bad"}, "POST", cfgOk); t("bad fallback header token -> 401", r.status===401);
r=await call({mode:"chat",prompt:"hi",user_id:"attacker"},{authorization:"Bearer good"}, "POST", cfgOk); t("good token -> 200 text", r.status===200 && /hello from mock/.test(r.body));
t("provider got key + system prompt, no client user id", aiBody && aiBody.auth==="Bearer SECRETKEY" && aiBody.b.messages[0].role==="system" && !JSON.stringify(aiBody).includes("attacker"));
t("secret not in response", !r.body.includes("SECRETKEY"));
await call({mode:"chat",prompt:"2"},{authorization:"Bearer good"}, "POST", cfgOk);
r=await call({mode:"chat",prompt:"3"},{authorization:"Bearer good"}, "POST", cfgOk); t("3rd call in a minute -> 429", r.status===429);
for (const [n,c] of out) console.log(c?"PASS":"FAIL", n, c?"":JSON.stringify(r));
sup.close();ai.close();process.exit(out.every(x=>x[1])?0:1);

import {readFileSync,writeFileSync} from 'node:fs';
const root='docs/audit-2026-10-17/',positive=new Set(['adjustment','income','expense','appointment']);
const quantile=(rows,field,q)=>rows.map(r=>r[field]).sort((a,b)=>a-b)[Math.min(rows.length-1,Math.floor(rows.length*q))]??null;
const files=['baseline-local','final-local','baseline-real','release-real','baseline-audio-real','release-audio-real','holdout-first-pass-real','holdout-followup-real'];
const evaluations=files.map(file=>{
 const d=JSON.parse(readFileSync(root+file+'.json','utf8')),commands=d.results.filter(r=>positive.has(r.expect.type)),success=commands.filter(r=>r.pass),cost=d.results.reduce((n,r)=>n+r.estimated_usd,0);
 return {file,...d.summary,positive_commands:commands.length,positive_prepared:success.length,controls:d.results.length-commands.length,controls_passed:d.results.filter(r=>!positive.has(r.expect.type)&&r.pass).length,estimated_usd_per_correct_preparation_including_failed_attempts_and_controls:success.length?cost/success.length:null,positive_p50_ms:quantile(commands,'ms',.5),positive_p95_ms:quantile(commands,'ms',.95),failed_ids:d.results.filter(r=>!r.pass).map(r=>r.id)};
});
const flow=JSON.parse(readFileSync(root+'whatsapp-flow-real-ai.json','utf8'));
const whatsapp=['text','audio'].map(type=>{const rows=flow.results.filter(r=>r.type===type),passed=rows.filter(r=>r.pass).length,cost=rows.reduce((n,r)=>n+r.estimated_usd,0);return {type,total:rows.length,passed,estimated_usd:cost,estimated_usd_per_completed_command:cost/passed,confirmation_p50_ms:quantile(rows,'confirmed_ms',.5),confirmation_p95_ms:quantile(rows,'confirmed_ms',.95),provider:'simulated',persistence:'SQLite memory',human_confirmation_delay_included:false};});
const out={measured_at:new Date().toISOString(),currency:'USD',pricing:{'gpt-4.1-mini':{input_per_million:.4,cached_input_per_million:.1,output_per_million:1.6},'gpt-4o-mini-transcribe':{audio_input_per_million:3,text_input_per_million:1.25,output_per_million:5}},evaluations,whatsapp};
writeFileSync(root+'comparison.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));

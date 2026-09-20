// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
import { recordsFor } from '../src/telemetry.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const telemetryTemp = mkdtempSync(tmpdir() + '/adaptive-telemetry-test-');
process.env.XDG_STATE_HOME = telemetryTemp;
process.on('exit', () => rmSync(telemetryTemp, { recursive: true, force: true }));
// Exact shipped route + real DSH/structured voice contract, isolated from user chats.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import * as plugin from '../src/index.js';
const req=createRequire(join(process.env.DSH_INSTALL_ROOT??join(homedir(),'.local/node/lib/node_modules/@deepseek-ai/dsh'),'package.json'));
const load=async name=>import(pathToFileURL(req.resolve('@deepseek-ai/'+name)).href);
const config=req('js-yaml').load(readFileSync(new URL('../cordis.patch.yml',import.meta.url),'utf8'))[0].insert[0].config;
const route=config.routes.find(r=>r.provider==='mx-qwen'&&r.model==='Qwen3.8-27B-GSQ-RCO-IQ3_S-mtp-262k');assert.ok(route);
const live=process.env.ADAPTIVE_LIVE_TEST==='1';
const {Context}=await load('cordis');const {createUserMessage}=await load('dsh-llm');
const {responseTool}=await import(pathToFileURL(join(homedir(),'.dsh/profiles/web/node_modules/dsh-resonant-voice/src/delivery.js')).href);
const ctx=new Context();const calls=[];const errors=[];ctx.on('agent/error',({error})=>errors.push(String(error)));
const server=createServer(async(req,res)=>{
 let body='';for await(const c of req)body+=c;calls.push(JSON.parse(body));
 const args={segments:[{text:'Hello. How are you?',speech:{emotion:'warm',speedMultiplier:1}}]};
 res.writeHead(200,{'content-type':'text/event-stream'});
 res.end('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',model:route.model,choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:'voice',type:'function',function:{name:'resonant_voice_reply',arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}]})+'\n\ndata: [DONE]\n\n');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const previousKey=process.env.DSH_ADAPTIVE_TEST_KEY;process.env.DSH_ADAPTIVE_TEST_KEY='local-test';
try {
 for(const name of ['dsh-session-projection','dsh-session','dsh-llm','dsh-system-prompt','dsh-tools','dsh-agent','dsh-agent-loop']){
  const m=await load(name);await ctx.plugin(m.default??m,name==='dsh-agent-loop'?{agents:[]} :{}).await();
 }
 await ctx.plugin(await load('dsh-llm-pi-ai'),{providers:{[route.provider]:{
  api:'openai-completions',baseURL:live?'http://127.0.0.1:8080/v1':`http://127.0.0.1:${server.address().port}/v1`,apiKeyEnv:'DSH_ADAPTIVE_TEST_KEY',reasoning:'low',
  models:[{id:route.model,name:route.model,contextWindow:262144,maxTokens:1024,reasoningEfforts:{off:null,low:'low',medium:'medium',xhigh:'xhigh'},compat:{thinkingFormat:'chat-template',chatTemplateKwargs:{enable_thinking:{$var:'thinking.enabled'},reasoning_effort:{$var:'thinking.effort',omitWhenOff:true},preserve_thinking:true}}}]
 }}}).await();
 await ctx.plugin(plugin,config).await();
 ctx.tools.register(responseTool(()=>({voiceStyle:true,requestId:'synthetic-voice-check',expires:Date.now()+60000})));
 const h=await ctx.agents.create({sessionId:'isolated-greeting-proof',meta:{agentPreset:'augmentor-linux-product'},agentOptions:{provider:route.provider,model:route.model,reasoningEffort:'low'}});
 const a=h.agent;const timer=setTimeout(()=>a.cancel({kind:'user'}),45000);
 try {
  for(const text of (live?["How's it going?"]:["How's it going?",'Diagnose the server failure.'])){
   a.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user',rpcId:'resonant-voice:synthetic'}}));await a.whenIdle();
  }
  assert.deepEqual(errors,[]);
  const events=a.session.snapshotEvents();const decisions=recordsFor(a.session).filter(e=>e.type==='adaptive-reasoning/decision').map(e=>e.data);
  assert.deepEqual(decisions.map(d=>d.effort),live?['off']:['off','xhigh']);assert.ok(decisions.every(d=>!d.textOnly));
  const replies=events.filter(e=>e.type==='tool/result'&&e.data.meta?.resonantVoice);assert.equal(replies.length,live?1:2);
  const measurements=recordsFor(a.session).filter(e=>e.type==='adaptive-reasoning/measurement').map(e=>e.data);
  assert.equal(measurements[0].reasoningCharacters,0);
  if(!live){assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c.chat_template_kwargs.enable_thinking),[false,true]);assert.ok(calls.every(c=>c.tools.some(t=>t.function.name==='resonant_voice_reply')));}
  console.log(JSON.stringify({live,efforts:decisions.map(d=>d.effort),structuredReplies:replies.length,measurements:measurements.map(({durationMs,reasoningCharacters})=>({durationMs,reasoningCharacters}))}));
 }finally{clearTimeout(timer);await h.dispose();}
}finally{await ctx.fiber.dispose();await new Promise(r=>server.close(r));if(previousKey===undefined)delete process.env.DSH_ADAPTIVE_TEST_KEY;else process.env.DSH_ADAPTIVE_TEST_KEY=previousKey;}

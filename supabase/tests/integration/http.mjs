// Only this disposable local stack. Admin SQL is fixture setup/cleanup only;
// every application request below uses a real anonymous user's JWT.
import {execFileSync} from 'node:child_process'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const url='http://127.0.0.1:55421',container='supabase_db_palabra-groups-local'
const sql=s=>execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8'}).trim()
const q=s=>"'"+String(s).replaceAll("'","''")+"'",hash=s=>createHash('sha256').update(s).digest('hex'),secret=()=>randomBytes(32).toString('hex')
const status=JSON.parse(execFileSync('npx',['--no-install','supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
assert.equal(status.API_URL,url)
const key=status.ANON_KEY,users=[],previous=sql('select enabled from palabra_private.feature_settings where id;')
async function request(path,body,token=key){
  const response=await fetch(url+path,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)})
  return {status:response.status,body:await response.json()}
}
async function user(){const r=await request('/auth/v1/signup',{});assert.equal(r.status,200);assert(r.body.access_token);users.push(r.body.user.id);return r.body.access_token}
async function rpc(token,name,args={}){const r=await request('/rest/v1/rpc/palabra_'+name,args,token);assert.equal(r.status,200,JSON.stringify(r.body));return r.body}
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.data}
const manage=(token,action,target=null)=>rpc(token,'manage_group',{p_action:action,p_target_profile_id:target,p_name:null,p_invite_hash:null,p_operation_id:randomUUID()})
try{
  sql('update palabra_private.feature_settings set enabled=true;')
  const [a,b,c,d,nextA]=await Promise.all(Array.from({length:5},user))
  const recovery=secret(),profiles=[]
  for(const [i,token]of[a,b,c,d].entries())profiles.push(ok(await rpc(token,'register',{p_nickname:'HTTP'+i,p_recovery_hash:hash(i===0?recovery:secret()),p_operation_id:randomUUID()})))
  const invite=randomBytes(16).toString('hex')
  const ga=ok(await rpc(a,'create_group',{p_name:'真实身份组',p_invite_hash:hash(invite),p_operation_id:randomUUID()}))
  ok(await rpc(d,'create_group',{p_name:'另一测试组',p_invite_hash:hash(randomBytes(16).toString('hex')),p_operation_id:randomUUID()}))
  for(const name of ['self','group','activity'])assert([401,403].includes((await request('/rest/v1/rpc/palabra_'+name,name==='activity'?{p_from_date:null}:{})).status))
  assert.equal((await rpc(c,'group')).code,'NOT_MEMBER')
  assert.notEqual(ok(await rpc(d,'group')).group.id,ga.group.id)
  const gb=ok(await rpc(b,'join_group',{p_code:invite,p_operation_id:randomUUID()}))
  assert.equal(ok(await rpc(b,'group')).memberProfiles.length,2)
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const payload={membershipId:ga.binding.membershipId,membershipGeneration:1,deviceGeneration:1,date,language:'en',version:2,goal:10,newCount:7,reviewCount:3,skippedCount:1,lastPracticedAt:new Date().toISOString()}
  ok(await rpc(a,'sync_summary',{p_payload:payload}))
  ok(await rpc(a,'sync_summary',{p_payload:{...payload,version:1,newCount:2}}))
  assert.equal(ok(await rpc(b,'activity',{p_from_date:null})).summaries[0].newCount,7)
  assert.equal((await rpc(d,'sync_summary',{p_payload:payload})).code,'STALE_BINDING')
  assert.equal(ok(await rpc(d,'activity',{p_from_date:null})).summaries.length,0)
  ok(await rpc(a,'publish_note',{p_membership_id:ga.binding.membershipId,p_membership_generation:1,p_device_generation:1,p_date:date,p_version:1,p_text:'今天继续'}))
  assert.equal(ok(await rpc(b,'activity',{p_from_date:null})).notes[0].text,'今天继续')
  ok(await rpc(a,'send_nudge',{p_target_profile_id:profiles[1].profileId,p_kind:'cheer',p_operation_id:randomUUID()}))
  assert.equal((await rpc(a,'send_nudge',{p_target_profile_id:profiles[1].profileId,p_kind:'cheer',p_operation_id:randomUUID()})).code,'ALREADY_SENT')
  const recoveryOp=randomUUID()
  ok(await rpc(nextA,'recover',{p_code:recovery,p_next_hash:hash(secret()),p_operation_id:recoveryOp}))
  // Treat the recovery response as lost: retrieve the exact original receipt.
  assert.equal(ok(await rpc(nextA,'operation',{p_operation_id:recoveryOp})).profileId,profiles[0].profileId)
  assert.equal((await rpc(a,'self')).code,'DEVICE_REPLACED')
  assert.equal((await rpc(a,'sync_summary',{p_payload:{...payload,version:3}})).code,'DEVICE_REPLACED')
  ok(await rpc(nextA,'sync_summary',{p_payload:{...payload,deviceGeneration:2,version:1,newCount:2}}))
  const aggregate=ok(await rpc(b,'activity',{p_from_date:null})).summaries[0]
  assert.equal(aggregate.newCount,7);assert.equal(aggregate.conservative,true)
  ok(await manage(nextA,'remove',profiles[1].profileId))
  assert.equal((await rpc(b,'activity',{p_from_date:null})).code,'NOT_MEMBER')
  assert.equal((await rpc(b,'publish_note',{p_membership_id:gb.binding.membershipId,p_membership_generation:1,p_device_generation:1,p_date:date,p_version:1,p_text:'失效'})).code,'STALE_BINDING')
  // Fixture: an old member's yesterday note must not be visible to today's new joiner.
  sql(`update public.palabra_memberships set joined_at=now()-interval '2 days' where id=${q(ga.binding.membershipId)}; insert into public.palabra_daily_notes values(${q(ga.binding.membershipId)},${q(date)}::date-1,2,1,'历史私密留言',now());`)
  ok(await rpc(c,'join_group',{p_code:invite,p_operation_id:randomUUID()}))
  assert(!ok(await rpc(c,'activity',{p_from_date:null})).notes.some(n=>n.text==='历史私密留言'))
  for(const token of [key,a,b,c,d,nextA]){
    const response=await fetch(url+'/rest/v1/palabra_profiles?select=*',{headers:{apikey:key,Authorization:`Bearer ${token}`}})
    assert([401,403].includes(response.status))
  }
  console.log('PASS: real anonymous JWTs; same-group access, no anon/direct-table/cross-group access, dates, stale snapshot, notes/nudges, lost recovery receipt, old-device and removed-member rejection')
}finally{
  if(users.length){const ids=users.map(q).join(',');sql(`delete from public.palabra_groups where owner_id in(select profile_id from palabra_private.device_bindings where auth_uid in(${ids})); delete from public.palabra_profiles where id in(select profile_id from palabra_private.device_bindings where auth_uid in(${ids})); delete from auth.users where id in(${ids});`)}
  sql(`update palabra_private.feature_settings set enabled=${previous==='t'};`)
}

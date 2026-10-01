// Fixed, disposable local container only; never accepts a hosted URL or admin key.
import { spawn } from 'node:child_process'
import { randomUUID,createHash,randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
const container='supabase_db_palabra-groups-local'
export const quote=value=>"'"+String(value).replaceAll("'","''")+"'"
export function sql(statement) {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'])
    let out='',err=''
    child.stdout.on('data',v=>out+=v); child.stderr.on('data',v=>err+=v)
    child.on('error',reject)
    child.on('close',code=>code===0?resolve(out.trim()):reject(new Error(`Local SQL failed (${code}): ${err}`)))
    child.stdin.end(statement)
  })
}
export async function rpc(uid,expression) {
  const result=await sql(`begin; set local role authenticated; select set_config('request.jwt.claims',${quote(JSON.stringify({sub:uid,role:'authenticated'}))},true); select ${expression}; commit;`)
  return JSON.parse(result.split('\n').at(-1))
}
const ids=Array.from({length:14},()=>randomUUID())
const code=randomBytes(32).toString('hex')
const hash=createHash('sha256').update(code).digest('hex')
const previous=await sql('select enabled from palabra_private.feature_settings where id;')
try {
  await sql(`update palabra_private.feature_settings set enabled=true; insert into auth.users(id) values ${ids.map(id=>`(${quote(id)})`).join(',')};`)
  assert.equal((await rpc(ids[0],`public.palabra_register('并发测试',${quote(hash)},${quote(randomUUID())})`)).ok,true)
  const attempts=await Promise.all(ids.slice(1,3).map(id=>rpc(id,`public.palabra_recover(${quote(code)},${quote(randomBytes(32).toString('hex'))},${quote(randomUUID())})`)))
  assert.equal(attempts.filter(r=>r.ok).length,1)
  assert.equal(attempts.filter(r=>r.code==='INVALID_CODE').length,1)
  assert.equal((await rpc(ids[0],'public.palabra_self()')).code,'DEVICE_REPLACED')
  console.log('PASS: two concurrent recoveries produce exactly one winner; old JWT rejected')
  for(const id of ids.slice(3)) assert.equal((await rpc(id,`public.palabra_register('容量测试',${quote(randomBytes(32).toString('hex'))},${quote(randomUUID())})`)).ok,true)
  const invite=randomBytes(16).toString('hex'),inviteHash=createHash('sha256').update(invite).digest('hex')
  const created=await rpc(ids[3],`public.palabra_create_group('并发容量',${quote(inviteHash)},${quote(randomUUID())})`)
  assert.equal(created.ok,true)
  for(const id of ids.slice(4,12)) assert.equal((await rpc(id,`public.palabra_join_group(${quote(invite)},${quote(randomUUID())})`)).ok,true)
  const joins=await Promise.all(ids.slice(12).map(id=>rpc(id,`public.palabra_join_group(${quote(invite)},${quote(randomUUID())})`)))
  assert.equal(joins.filter(r=>r.ok).length,1)
  assert.equal(joins.filter(r=>r.code==='GROUP_FULL').length,1)
  assert.equal((await rpc(ids[3],'public.palabra_group()')).data.memberProfiles.length,10)
  console.log('PASS: competing tenth joins produce one winner; exactly ten members')
} finally {
  await sql(`delete from public.palabra_groups where owner_id in (select profile_id from palabra_private.device_bindings where auth_uid in (${ids.map(quote).join(',')})); delete from public.palabra_profiles where id in (select profile_id from palabra_private.device_bindings where auth_uid in (${ids.map(quote).join(',')})); delete from auth.users where id in (${ids.map(quote).join(',')}); update palabra_private.feature_settings set enabled=${previous==='t'};`)
}

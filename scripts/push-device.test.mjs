import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createDatabase} from '../lib/database.mjs';
import {updatePushDevice} from '../lib/push-device.mjs';
import {sendNotification} from './push-notifications.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE push_accounts(tenant_id TEXT,tech_id TEXT,active_subscription_id TEXT,device_status TEXT,device_checked_at INTEGER,PRIMARY KEY(tenant_id,tech_id));
    INSERT INTO push_accounts(tenant_id,tech_id) VALUES('a','1111'),('b','1111'),('a','SUP');`);
  sqlite.exec('CREATE UNIQUE INDEX active_phone ON push_accounts(active_subscription_id) WHERE active_subscription_id IS NOT NULL');
  return createDatabase({sqlite,url:null});
}
const user={tenantId:'a',techId:'1111',isAdmin:false};
const report=(subscriptionId,activate=false,status='connected')=>({subscriptionId,activate,status});
test('new phone replaces old phone; old reports cannot reclaim it or change its status',async()=>{
  const db=fixture();try {
    assert.equal(await updatePushDevice(db,user,report('phone-one')),false);
    assert.equal((await db.prepare("SELECT device_status FROM push_accounts WHERE tenant_id='a' AND tech_id='1111'").get()).device_status,'unknown');
    assert.equal(await updatePushDevice(db,user,report('phone-one',true)),true);
    assert.equal(await updatePushDevice(db,user,report('phone-two',true)),true);
    assert.equal(await updatePushDevice(db,user,report('phone-one')),false);
    assert.equal(await updatePushDevice(db,user,report('phone-one',false,'blocked')),false);
    const selected=await db.prepare('SELECT * FROM push_accounts WHERE tenant_id=? AND tech_id=?').get('a','1111');
    assert.equal(selected.active_subscription_id,'phone-two');assert.equal(selected.device_status,'connected');
    assert.equal(await updatePushDevice(db,user,report('phone-two')),true);
    assert.equal((await db.prepare("SELECT active_subscription_id FROM push_accounts WHERE tenant_id='b'").get()).active_subscription_id,null);
    await assert.rejects(updatePushDevice(db,user,report(null,true)),/Subscribe/);
  }finally{await db.close();}
});
test('a phone switching accounts is removed from the previous account; supervisors stay unrestricted',async()=>{
  const db=fixture();try {
    await updatePushDevice(db,user,report('shared-phone',true));
    await updatePushDevice(db,{...user,tenantId:'b'},report('shared-phone',true));
    assert.equal(await updatePushDevice(db,user,report('shared-phone')),false);
    assert.equal(await updatePushDevice(db,{...user,tenantId:'b'},report('shared-phone')),true);
    assert.equal(await updatePushDevice(db,{...user,techId:'SUP',isAdmin:true},report('supervisor-phone')),true);
  }finally{await db.close();}
});
test('provider delivery targets only selected technician subscription and fails closed without one',async()=>{
  const original=globalThis.fetch,bodies=[];
  globalThis.fetch=async(_url,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:'sent'})};};
  const event={id:'event',message:'Fix QC',url:'/profile?view=rejected',expires_at:Date.now()+3600000};
  const config={appId:'test',apiKey:'fake-test-key',origin:'https://example.test'};
  try {
    await sendNotification(event,{is_admin:0,external_id:'account',active_subscription_id:'new-phone'},config);
    assert.deepEqual(bodies[0].include_subscription_ids,['new-phone']);assert.equal(bodies[0].include_aliases,undefined);
    await assert.rejects(sendNotification(event,{is_admin:0,external_id:'account'},config),/active notification phone/);
    assert.equal(bodies.length,1);
    await sendNotification(event,{is_admin:1,external_id:'supervisor'},config);
    assert.deepEqual(bodies[1].include_aliases,{external_id:['supervisor']});
  }finally{globalThis.fetch=original;}
});

test('PostgreSQL applies the same phone replacement and stale report protection',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const {postgresSql}=await import('../lib/database.mjs');
  const pg=new PGlite();
  const db={prepare(sql){const statement={sql,values:[],bind(...values){return {...this,values};},async run(){return pg.query(postgresSql(this.sql),this.values);},async first(){return (await pg.query(postgresSql(this.sql),this.values)).rows[0];}};return statement;},async batch(statements){await pg.exec('BEGIN');try{for(const s of statements)await s.run();await pg.exec('COMMIT');}catch(e){await pg.exec('ROLLBACK');throw e;}}};
  try {
    await pg.exec("CREATE TABLE push_accounts(tenant_id TEXT,tech_id TEXT,active_subscription_id TEXT UNIQUE,device_status TEXT,device_checked_at BIGINT,PRIMARY KEY(tenant_id,tech_id)); INSERT INTO push_accounts(tenant_id,tech_id) VALUES('a','1111'),('b','1111');");
    await updatePushDevice(db,user,report('phone-one',true));
    await updatePushDevice(db,user,report('phone-two',true));
    assert.equal(await updatePushDevice(db,user,report('phone-one')),false);
    assert.equal(await updatePushDevice(db,user,report('phone-two')),true);
    await updatePushDevice(db,{...user,tenantId:'b'},report('phone-two',true));
    assert.equal(await updatePushDevice(db,user,report('phone-two')),false);
  }finally{await pg.close();}
});

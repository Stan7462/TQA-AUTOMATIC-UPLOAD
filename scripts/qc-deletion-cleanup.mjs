import { DatabaseSync } from 'node:sqlite';
import { unlinkSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { createDatabase } from '../lib/database.mjs';
import { cleanupDeletedQcPhotos } from '../lib/qc-deletion-storage.mjs';

export async function retryDeletedQcPhotos() {
  const directory=resolve(process.env.TQA_DATA_DIR||'.tqa-data');
  const sqlite=process.env.DATABASE_URL?null:new DatabaseSync(join(directory,'tqa.sqlite'));
  const db=createDatabase({sqlite});
  try{
    await cleanupDeletedQcPhotos(db,{async delete(key){
      if(!/^captures\/\d{13}-[a-f0-9-]{36}\.jpg$/.test(key))throw Error('Invalid photo key');
      try{unlinkSync(join(directory,key));}catch(error){if(error.code!=='ENOENT')throw error;}
    }});
  }finally{await db.close();}
}

export function startQcDeletionCleanup() {
  let running=false;
  const tick=async()=>{if(running)return;running=true;try{await retryDeletedQcPhotos();}catch(error){console.error('Deleted QC photo cleanup failed',error);}finally{running=false;}};
  void tick();
  const timer=setInterval(()=>void tick(),60_000);timer.unref();
}

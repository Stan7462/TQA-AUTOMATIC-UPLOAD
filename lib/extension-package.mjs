import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {deflateRawSync} from 'node:zlib';

// Package only installable extension files; never include local state or secrets.
const files=['manifest.json','background.js','content.js','core.js','popup.css','popup.html','popup.js'];
const crcTable=Array.from({length:256},(_,value)=>{
  for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);
  return value>>>0;
});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];return (crc^0xffffffff)>>>0;}
export function createExtensionPackage(root=process.cwd()){
  const source=join(root,'chrome-extension');
  const manifest=JSON.parse(readFileSync(join(source,'manifest.json'),'utf8'));
  if(!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version))throw Error('Invalid extension version');
  const names=[...files,...readdirSync(join(source,'icons')).filter(name=>/^icon-\d+\.png$/.test(name)).sort().map(name=>`icons/${name}`)];
  const local=[],central=[];let offset=0,size=0;
  for(const name of names){
    const filename=Buffer.from(name),bytes=readFileSync(join(source,name)),compressed=deflateRawSync(bytes),crc=crc32(bytes);
    const header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);
    header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(filename.length,26);
    local.push(header,filename,compressed);
    const record=Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50,0);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(8,10);record.writeUInt16LE(33,14);
    record.writeUInt32LE(crc,16);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(bytes.length,24);record.writeUInt16LE(filename.length,28);record.writeUInt32LE(offset,42);
    central.push(record,filename);size+=record.length+filename.length;offset+=header.length+filename.length+compressed.length;
  }
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);
  return {version:manifest.version,filename:`tqa-catalyst-uploader-${manifest.version}.zip`,bytes:Buffer.concat([...local,...central,end])};
}

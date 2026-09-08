(function(global){
  'use strict';
  function writeU16(arr,off,val){arr[off]=val&255;arr[off+1]=(val>>>8)&255;}
  function writeU32(arr,off,val){arr[off]=val&255;arr[off+1]=(val>>>8)&255;arr[off+2]=(val>>>16)&255;arr[off+3]=(val>>>24)&255;}
  const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);table[n]=c>>>0;}return table;})();
  function crc32(data){let c=0xFFFFFFFF;for(let i=0;i<data.length;i++)c=crcTable[(c^data[i])&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
  function dosDateTime(date=new Date()){const year=Math.max(1980,date.getFullYear());return{time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()};}
  async function makeZip(entries){
    if(!entries.length)throw new Error('No files to zip');
    if(entries.length>65535)throw new Error('ZIP supports up to 65535 files in this build');
    const encoder=new TextEncoder(),locals=[],centrals=[];let offset=0;const dt=dosDateTime();
    for(const entry of entries){
      const name=encoder.encode(entry.name),data=new Uint8Array(await entry.blob.arrayBuffer()),crc=crc32(data);
      const local=new Uint8Array(30+name.length+data.length);writeU32(local,0,0x04034b50);writeU16(local,4,20);writeU16(local,6,0x0800);writeU16(local,8,0);writeU16(local,10,dt.time);writeU16(local,12,dt.date);writeU32(local,14,crc);writeU32(local,18,data.length);writeU32(local,22,data.length);writeU16(local,26,name.length);writeU16(local,28,0);local.set(name,30);local.set(data,30+name.length);locals.push(local);
      const central=new Uint8Array(46+name.length);writeU32(central,0,0x02014b50);writeU16(central,4,20);writeU16(central,6,20);writeU16(central,8,0x0800);writeU16(central,10,0);writeU16(central,12,dt.time);writeU16(central,14,dt.date);writeU32(central,16,crc);writeU32(central,20,data.length);writeU32(central,24,data.length);writeU16(central,28,name.length);writeU16(central,30,0);writeU16(central,32,0);writeU16(central,34,0);writeU16(central,36,0);writeU32(central,38,0);writeU32(central,42,offset);central.set(name,46);centrals.push(central);offset+=local.length;
    }
    const centralSize=centrals.reduce((a,x)=>a+x.length,0),end=new Uint8Array(22);writeU32(end,0,0x06054b50);writeU16(end,4,0);writeU16(end,6,0);writeU16(end,8,entries.length);writeU16(end,10,entries.length);writeU32(end,12,centralSize);writeU32(end,16,offset);writeU16(end,20,0);
    return new Blob([...locals,...centrals,end],{type:'application/zip'});
  }
  global.PixelZip={makeZip,crc32,writeU16,writeU32};
})(typeof window!=='undefined'?window:globalThis);

'use strict';
const zlib=require('node:zlib');
function crc32(buf){let v=0xffffffff;for(const b of buf){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0)}return (v^0xffffffff)>>>0}
function chunk(type,data){const head=Buffer.from(type,'ascii'),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([head,data])));return Buffer.concat([len,head,data,crc])}
function png(size=32){
 const stride=size*4+1,raw=Buffer.alloc(stride*size);
 for(let y=0;y<size;y++){raw[y*stride]=0;for(let x=0;x<size;x++){const p=y*stride+1+x*4,inside=x>=2&&x<size-2&&y>=2&&y<size-2;
 const mark=(x===15||x===16)&&y>9&&y<26||(y===22||y===23)&&x>7&&x<25||((x-15)**2+(y-9)**2<14);
 raw[p]=mark?255:12;raw[p+1]=mark?255:115;raw[p+2]=mark?255:222;raw[p+3]=inside?255:0;}}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
module.exports={png,crc32};

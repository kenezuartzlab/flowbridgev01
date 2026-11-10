export const MAX_BANNER_BYTES=2_000_000;
export function inspectBannerImage(bytes:Uint8Array,mime:string): {width:number;height:number;extension:string}|null {
  if(bytes.length<24||bytes.length>MAX_BANNER_BYTES) return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let width=0,height=0,extension='';
  if(mime==='image/png' && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)) {width=view.getUint32(16);height=view.getUint32(20);extension='png';}
  else if(mime==='image/gif' && new TextDecoder().decode(bytes.slice(0,6)).match(/^GIF8[79]a$/)) {width=view.getUint16(6,true);height=view.getUint16(8,true);extension='gif';}
  else if(mime==='image/webp' && new TextDecoder().decode(bytes.slice(0,4))==='RIFF' && new TextDecoder().decode(bytes.slice(8,12))==='WEBP') {
    const kind=new TextDecoder().decode(bytes.slice(12,16));extension='webp';
    if(kind==='VP8X'&&bytes.length>=30){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
    else if(kind==='VP8 '&&bytes.length>=30&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383;}
    else if(kind==='VP8L'&&bytes.length>=25&&bytes[20]===47){const b=view.getUint32(21,true);width=(b&16383)+1;height=((b>>>14)&16383)+1;}
  } else if(mime==='image/jpeg' && bytes[0]===255&&bytes[1]===216) {
    extension='jpg';let i=2;
    while(i+4<bytes.length){if(bytes[i]!==255)break;const marker=bytes[i+1];const size=view.getUint16(i+2);if(size<2||i+size+2>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=8){height=view.getUint16(i+5);width=view.getUint16(i+7);break;}i+=size+2;}
  }
  return width>=32&&height>=32&&width<=8192&&height<=8192&&width*height<=32_000_000 ? {width,height,extension}:null;
}
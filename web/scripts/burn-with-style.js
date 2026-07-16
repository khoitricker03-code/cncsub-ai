import fs from 'fs';
import path from 'path';

const base = 'http://localhost:3000';
const projectId = 'aa31bab7-4acd-4557-9d59-9cda1c213388';

async function main(){
  const srtPath = path.join(process.cwd(), 'tmp-translated.srt');
  if(!fs.existsSync(srtPath)) throw new Error('SRT not found');
  const srtBuf = fs.readFileSync(srtPath);
  const formData = new FormData();
  formData.append('video', new Blob([fs.readFileSync(path.join(process.cwd(), 'storage','projects', projectId, 'media', 'input.mp4'))]), 'input.mp4');
  formData.append('subtitle', new Blob([srtBuf]), 'subtitle.srt');
  const style = {
    fontFamily: 'Arial',
    fontSize: 80,
    alignment: 2,
    outline: 0,
    shadow: 0,
    backgroundColour: '&H000000FF'
  };
  formData.append('hardwareAcceleration', 'software');
  formData.append('style', JSON.stringify(style));

  const resp = await fetch(`${base}/api/burn`, { method: 'POST', body: formData });
  if(!resp.ok) {
    const t = await resp.text();
    throw new Error('burn failed: ' + t);
  }
  const outPath = path.join(process.cwd(), 'tmp-burned-2.mp4');
  const ws = fs.createWriteStream(outPath);
  const reader = resp.body.getReader();
  while(true){
    const { done, value } = await reader.read();
    if(done) break;
    ws.write(Buffer.from(value));
  }
  ws.end();
  console.log('Saved', outPath);
}

main().catch(e=>{console.error(e); process.exit(1)});

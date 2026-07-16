import fs from 'fs';
import path from 'path';

const base = 'http://localhost:3000';
const projectId = 'aa31bab7-4acd-4557-9d59-9cda1c213388';

function formatSrtTime(seconds){
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const remainingAfterHours = totalMilliseconds % 3600000;
  const minutes = Math.floor(remainingAfterHours / 60000);
  const remainingAfterMinutes = remainingAfterHours % 60000;
  const secs = Math.floor(remainingAfterMinutes / 1000);
  const milliseconds = remainingAfterMinutes % 1000;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')},${String(milliseconds).padStart(3,'0')}`;
}

function buildSrt(segments){
  return segments.map((segment, i)=>{
    const text = (segment.text||'').trim();
    return `${i+1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${text}`;
  }).join('\n\n');
}

async function main(){
  console.log('1) Requesting translation for project', projectId);
  const tResp = await fetch(`${base}/api/projects/${projectId}/translate`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ targetLanguage: 'zh' }),
  });
  const tJson = await tResp.json();
  console.log('Translate response:', tJson.success ? 'ok' : 'failed', tJson.error || '');
  if (!tJson.success) throw new Error('Translation failed: ' + (tJson.error || 'unknown'));

  console.log('2) Fetching project workspace to verify translated segments');
  const pResp = await fetch(`${base}/api/projects/${projectId}`);
  const pJson = await pResp.json();
  if (!pJson.success) throw new Error('Open project failed: ' + (pJson.error || 'unknown'));
  const translated = pJson.translatedSegments;
  console.log('Translated segments length:', Array.isArray(translated) ? translated.length : 'none');
  if (!Array.isArray(translated) || translated.length === 0) throw new Error('No translated segments saved');

  console.log('3) Building SRT from translated segments');
  const srt = buildSrt(translated);
  const srtPath = path.join(process.cwd(), 'tmp-translated.srt');
  fs.writeFileSync(srtPath, '\uFEFF' + srt);
  console.log('Wrote SRT to', srtPath);

  console.log('4) Calling burn API with stored input video and generated SRT');
  const videoPath = path.join(process.cwd(), 'storage', 'projects', projectId, 'media', 'input.mp4');
  if (!fs.existsSync(videoPath)) throw new Error('Sample video not found: ' + videoPath);
  const stat = fs.statSync(videoPath);
  console.log('Video size:', stat.size);

  const formData = new FormData();
  const videoBuf = fs.readFileSync(videoPath);
  const srtBuf = fs.readFileSync(srtPath);
  formData.append('video', new Blob([videoBuf]), 'input.mp4');
  formData.append('subtitle', new Blob([srtBuf]), 'subtitle.srt');
  formData.append('hardwareAcceleration', 'software');
  formData.append('style', JSON.stringify({ fontFamily: 'Arial', fontSize: 42 }));

  const burnResp = await fetch(`${base}/api/burn`, { method: 'POST', body: formData });
  if (!burnResp.ok) {
    const err = await burnResp.text();
    throw new Error('Burn failed: ' + err);
  }

  console.log('Burn succeeded, downloading response');
  const outPath = path.join(process.cwd(), 'tmp-burned.mp4');
  const fileStream = fs.createWriteStream(outPath);
  const reader = burnResp.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  while(true){
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
    received += value.length;
    process.stdout.write(`\rReceived ${received} bytes`);
  }
  fileStream.end();
  console.log('\nSaved burned video to', outPath);

  console.log('E2E test completed successfully');
}

main().catch(err=>{console.error('E2E test failed:', err); process.exit(1);});

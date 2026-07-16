import fs from 'fs';

const base = 'http://localhost:3000';
const projectId = 'aa31bab7-4acd-4557-9d59-9cda1c213388';

async function main(){
  const resp = await fetch(`${base}/api/projects/${projectId}`);
  const json = await resp.json();
  if(!json.success) { console.error('failed to open project', json.error); process.exit(2); }
  const translated = json.translatedSegments || [];
  const hasCJK = translated.some(s => /[\u4E00-\u9FFF]/.test(s.text));
  console.log('Translated segments count:', translated.length, 'Contains CJK:', hasCJK);
  if(!hasCJK) process.exit(3);
}

main().catch(e=>{console.error(e); process.exit(1);});

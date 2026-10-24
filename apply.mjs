// Run from the FORM project root: node form-board-subcategory-update/apply.mjs
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=dirname(fileURLToPath(import.meta.url)),root=process.cwd();
const hash=data=>createHash('sha256').update(data.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
const manifest=JSON.parse(await readFile(resolve(source,'manifest.json'),'utf8'));
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
if(pkg.name!=='form-outfit-studio')throw Error('FORM 프로젝트 루트에서 실행해 주세요.');
const changes=[];
for(const entry of manifest){
  const target=resolve(root,entry.path),rel=relative(root,target);
  if(rel.startsWith('..')||isAbsolute(rel))throw Error('Invalid path');
  const bytes=await readFile(resolve(source,'files',entry.path));
  if(hash(bytes)!==entry.after)throw Error('업데이트 파일이 손상되었습니다: '+entry.path);
  let current=null;
  try{current=hash(await readFile(target));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(current===entry.after)continue;
  if(current!==entry.before)throw Error('예상 버전과 다른 파일이 있습니다. 파일을 덮어쓰지 않았습니다: '+entry.path+' (현재 수정 내용을 확인해 주세요.)');
  changes.push({target,bytes,path:entry.path});
}
for(const change of changes){await mkdir(dirname(change.target),{recursive:true});await writeFile(change.target,change.bytes);console.log('Updated '+change.path);}
console.log('코드 적용 완료. pnpm db:migrate → pnpm check → pnpm test → pnpm build 순서로 실행해 주세요.');

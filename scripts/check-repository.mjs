import {execFileSync} from 'node:child_process';
const allowed=new Set(['.gitignore','.gitattributes','package.json','README.md','server.mjs','start.ps1','start.cmd','public/index.html','public/style.css','public/app.js','scripts/check-repository.mjs','tests/server.test.mjs','.githooks/pre-commit','.githooks/pre-push']);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const paths=git('ls-files','-z').split('\0').filter(Boolean);
let bad=paths.filter(p=>!allowed.has(p));
for(const p of paths){
  if(!allowed.has(p))continue;
  const data=git('show',':'+p);
  if(/\bsk-[A-Za-z0-9_-]{24,}/.test(data))bad.push(p+' (possible API key)');
}
if(process.argv.includes('--history')){
  const history=git('rev-list','--objects','--all').split('\n');
  for(const line of history){
    const split=line.indexOf(' ');if(split<0)continue;
    const hash=line.slice(0,split),name=line.slice(split+1);
    if(['public','scripts','tests','.githooks'].includes(name))continue;
    if(!allowed.has(name)){bad.push(name+' (history)');continue;}
    if(/\bsk-[A-Za-z0-9_-]{24,}/.test(git('cat-file','-p',hash)))bad.push(name+' (possible key in history)');
  }
}
if(bad.length){console.error('Blocked: unapproved/private content in Git:\n'+[...new Set(bad)].join('\n'));process.exit(1);}
console.log('Repository privacy check passed: only approved source files; no detected API keys.');

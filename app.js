"use strict";
const $=id=>document.getElementById(id), endpoint=window.YEH_GAS_URL;
const state={token:'',ready:false,queue:new Map(),sequence:0,regulations:[],doc:null,selectedRow:null,user:null};
function call(action,p={}){return new Promise((resolve,reject)=>{
 const id='req'+(++state.sequence);
 const frame=document.createElement('iframe');frame.name='yeh_transport_'+id;frame.hidden=true;frame.setAttribute('sandbox','allow-scripts allow-forms allow-same-origin');document.body.append(frame);
 const form=document.createElement('form');form.method='POST';form.action=endpoint;form.target=frame.name;form.hidden=true;
 for(const [name,value] of Object.entries({requestId:id,payload:JSON.stringify({...p,action,token:state.token})})){
  const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
 }
 document.body.append(form);
 const cleanup=()=>{state.queue.delete(id);form.remove();frame.remove();};
 const timer=setTimeout(()=>{cleanup();reject(Error('Tidak menerima jawaban GAS dalam 60 detik. Periksa deployment dan GITHUB_PAGES_ORIGIN.'));},60000);
 state.queue.set(id,{resolve,reject,timer,cleanup});form.submit();
});}
window.addEventListener('message',e=>{
 if(e.origin!=='https://script.googleusercontent.com'&&!e.origin.endsWith('.googleusercontent.com')&&e.origin!=='https://script.google.com')return;
 const m=e.data;if(!m||m.channel!=='YEH_V1'||typeof m.id!=='string')return;
 const q=state.queue.get(m.id);if(!q)return;clearTimeout(q.timer);q.cleanup();
 if(m.payload&&m.payload.ok)q.resolve(m.payload.data);else q.reject(Error(m.payload?.message||'Kesalahan server'));
});
async function run(action,p={}){try{notice('Memuat...');const v=await call(action,p);notice('');return v;}catch(e){notice(e.message);throw e;}}
function showLogged(on){$('loginPanel').hidden=on;$('app').hidden=!on;$('logout').hidden=!on;}
function boot(){}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{const d=await run('login',{userId:f.get('userId'),password:f.get('password')});state.token=d.token||d.sessionToken||'';if(!state.token)throw Error('Respons login tidak menyediakan token.');const init=await run('init');state.user=init.user;$('who').textContent=init.user.name;showLogged(true);if(init.user.changeRequired){$('app').hidden=true;$('changePanel').hidden=false;}else loadInit(init);e.target.reset();}catch(ex){$('loginMsg').textContent=ex.message;}});
$('changeForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{await run('changePassword',{oldPassword:f.get('oldPassword'),newPassword:f.get('newPassword')});alert('Password diganti. Silakan masuk kembali.');location.reload();}catch(ex){alert(ex.message);}});
$('logout').addEventListener('click',async()=>{try{await call('logout');}catch(_){}location.reload();});
function loadInit(init){state.regulations=init.regulations||[];state.user=init.user;const groups=[...new Set(state.regulations.map(r=>r.group).filter(Boolean))];opt($('groupFilter'),[{value:'',label:'Semua kelompok'},...groups.map(g=>({value:g,label:g}))],x=>x.value,x=>x.label);const admin=init.user.role==='ADMIN';$('sync').hidden=$('adminToggle').hidden=!admin;renderList();updateAdminRegs();if(admin)loadUsers();}
function filtered(){const q=$('search').value.trim().toLocaleLowerCase('id');return state.regulations.filter(r=>(!$('groupFilter').value||r.group===$('groupFilter').value)&&(!q||(r.title+' '+r.group).toLowerCase().includes(q)));}
function renderList(){const box=$('regList');box.replaceChildren();for(const r of filtered()){const btn=elem('button','item'+(state.doc?.meta.id===r.id?' active':''));btn.append(elem('strong','',r.title),elem('div','meta',r.group));if(r.restricted)btn.append(elem('span','badge','Terbatas'));btn.onclick=()=>openDocument(r.id);box.append(btn);}if(!box.childNodes.length)box.append(elem('p','meta','Tidak ada regulasi.'));}
$('search').addEventListener('input',renderList);$('groupFilter').addEventListener('change',renderList);
async function openDocument(id,rowNumber){try{const doc=await run('document',{id});state.doc=doc;const meta=doc.meta;$('docHeader').replaceChildren(elem('h2','',meta.title),elem('div','meta',meta.group+(meta.restricted?' · Terbatas':'')));$('docTools').hidden=false;const pdf=$('pdf');pdf.hidden=!/^https:\/\/drive\.google\.com\//.test(meta.pdf||'');if(!pdf.hidden)pdf.href=meta.pdf;
opt($('versionSelect'),doc.versions||[],x=>x.key,x=>x.name);const comp=[{key:'',name:'Tidak'}].concat(doc.versions||[]);opt($('compareSelect'),comp,x=>x.key,x=>x.name);if((doc.versions||[]).some(v=>v.key==='utuh'))$('versionSelect').value='utuh';state.selectedRow=rowNumber||null;renderDoc();renderList();if(rowNumber){const item=document.getElementById('row-'+rowNumber);item?.scrollIntoView({block:'center',behavior:'smooth'});}}catch(e){alert(e.message);}}
function renderDoc(){if(!state.doc)return;const {rows}=state.doc,v=$('versionSelect').value,c=$('compareSelect').value;const content=$('content');content.replaceChildren();const outline=$('outline');outline.replaceChildren();let last='';for(const r of rows){const label=[r.bab,r.pasal,r.ayat,r.poin,r.subpoin].filter(Boolean).join(' · ');const wrapper=elem('div','rowText');wrapper.id='row-'+r.row;const structural=elem('div','structure',label);wrapper.append(structural);const main=elem('div','law',r[v]||'');if(c&&c!==v){const comparison=elem('div','comparison');const left=elem('section');left.append(elem('small','meta',v),main);const right=elem('section');right.append(elem('small','meta',c),elem('div','law',r[c]||''));comparison.append(left,right);wrapper.append(comparison);}else wrapper.append(main);wrapper.onclick=()=>{state.selectedRow=r.row;notice('Dipilih: '+label);};content.append(wrapper);if(r.pasal&&r.pasal!==last){last=r.pasal;const b=elem('button','',r.pasal);b.onclick=()=>document.getElementById('row-'+r.row)?.scrollIntoView({behavior:'smooth'});outline.append(b);}}}
$('versionSelect').onchange=renderDoc;$('compareSelect').onchange=renderDoc;
$('copy').onclick=async()=>{if(!state.doc)return;const r=state.doc.rows.find(r=>r.row===state.selectedRow)||state.doc.rows[0];if(!r)return;const text=[state.doc.meta.title,[r.bab,r.pasal,r.ayat,r.poin,r.subpoin].filter(Boolean).join(' · '),r[$('versionSelect').value]||''].join('\n');try{await navigator.clipboard.writeText(text);notice('Ketentuan disalin.');}catch(e){notice('Penyalinan gagal: '+e.message);}};
$('searchText').onclick=async()=>{const q=$('search').value.trim();if(q.length<2){notice('Masukkan sedikitnya dua karakter.');return;}try{const result=await run('search',{query:q,group:$('groupFilter').value});const results=$('results');results.replaceChildren();$('resultsPanel').hidden=false;for(const r of result.results||[]){const el=elem('div','result');const btn=elem('button','',r.title+' · '+[r.pasal,r.ayat].filter(Boolean).join(' / '));btn.onclick=()=>openDocument(r.id,r.row);el.append(btn,elem('p','meta',r.excerpt));results.append(el);}if(!results.childNodes.length)results.append(elem('p','','Tidak ditemukan.'));}catch(e){alert(e.message);}};
$('sync').onclick=async()=>{if(!confirm('Sinkronisasi daftar regulasi baru dari spreadsheet sumber?'))return;try{const out=await run('adminSync');alert('Sinkronisasi selesai: '+JSON.stringify(out));await refresh();}catch(e){alert(e.message);}};
$('adminToggle').onclick=()=>{$('adminPanel').hidden=!$('adminPanel').hidden;if(!$('adminPanel').hidden)$('adminPanel').scrollIntoView({behavior:'smooth'});};
async function refresh(){const d=await run('init');loadInit(d);}
function updateAdminRegs(){const a=state.regulations.map(x=>({key:x.id,name:x.title}));for(const id of ['accessReg','adminReg'])opt($(id),a,x=>x.key,x=>x.name);}
async function loadUsers(){try{const users=await run('adminUsers');$('usersTable').replaceChildren(...users.map(u=>elem('div','rowText',u.id+' — '+u.name+' ('+u.role+') · '+u.active)));}catch(e){notice(e.message);}}
function formObj(id){return Object.fromEntries(new FormData($(id)).entries());}
async function saveForm(id,action,key){$(id).addEventListener('submit',async e=>{e.preventDefault();try{await run(action,{[key]:formObj(id)});notice('Data berhasil disimpan.');if(action==='adminSaveUser')await loadUsers();}catch(ex){alert(ex.message);}});}
saveForm('userForm','adminSaveUser','user');saveForm('groupForm','adminSaveGroup','group');saveForm('memberForm','adminSaveMember','member');saveForm('accessForm','adminSaveAccess','rule');
$('resetForm').onsubmit=async e=>{e.preventDefault();if(!confirm('Reset password pengguna ini?'))return;try{await run('adminResetPassword',formObj('resetForm'));notice('Password direset.');e.target.reset();}catch(ex){alert(ex.message);}};
$('regForm').onsubmit=async e=>{e.preventDefault();try{await run('adminSaveRegulation',formObj('regForm'));notice('Pengaturan disimpan.');await refresh();}catch(ex){alert(ex.message);}};
boot();

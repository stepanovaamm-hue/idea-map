import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

const SUPABASE_URL = 'https://hhawxjifdqlwyaxbfspc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VbfT1VEsS1a-Lu-_EZlKKA_T52dbc07';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = s => document.querySelector(s);
const els = {
  authView: $('#authView'), workspace: $('#workspace'), authForm: $('#authForm'), email: $('#emailInput'), password: $('#passwordInput'),
  authMessage: $('#authMessage'), signupBtn: $('#signupBtn'), logoutBtn: $('#logoutBtn'), sync: $('#syncStatus'),
  ideaForm: $('#ideaForm'), editingId: $('#editingId'), title: $('#titleInput'), cluster: $('#clusterInput'), note: $('#noteInput'),
  tags: $('#tagsInput'), image: $('#imageInput'), ideaMessage: $('#ideaMessage'), resetForm: $('#resetFormBtn'),
  search: $('#searchInput'), filters: $('#clusterFilters'), map: $('#ideaMap'), mapEmpty: $('#mapEmpty'), selected: $('#selectedPanel'),
  cards: $('#cardsView'), mapView: $('#mapView'), mapMode: $('#mapModeBtn'), cardsMode: $('#cardsModeBtn'), count: $('#ideaCount'),
  seed: $('#seedBtn'), linkSource: $('#linkSource'), linkTarget: $('#linkTarget'), linkType: $('#linkType'),
  addLink: $('#addLinkBtn'), linkMessage: $('#linkMessage'), cardTemplate: $('#cardTemplate')
};

const clusters = {
  work:{label:'Работа / ПравоТех',color:'#5b8def',cx:220,cy:190,rx:180,ry:140},
  ohapka:{label:'Охапка',color:'#d889a3',cx:965,cy:190,rx:175,ry:135},
  visual:{label:'Визуальные идеи',color:'#8e6bc8',cx:600,cy:175,rx:180,ry:135},
  personal:{label:'Личное',color:'#55a58f',cx:255,cy:570,rx:180,ry:125},
  research:{label:'Исследовать',color:'#d6a546',cx:915,cy:565,rx:180,ry:125},
  inbox:{label:'Входящие',color:'#9b97a3',cx:600,cy:525,rx:150,ry:105}
};
let ideas = [], manualLinks = [], selectedId = null, filter = 'all', mode = 'map';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parseTags = v => [...new Set(String(v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))].slice(0,12);
const overlap = (a,b) => a.tags.filter(t=>b.tags.includes(t));
const visibleIdeas = () => ideas.filter(i => {
  const q = els.search.value.trim().toLowerCase();
  const matchesFilter = filter==='all' || i.cluster===filter;
  const hay = [i.title,i.note,...i.tags].join(' ').toLowerCase();
  return matchesFilter && (!q || hay.includes(q));
});

function syncStatus(text, ok=false){ els.sync.textContent=text; els.sync.style.color=ok?'#2f7d63':''; }

async function getSession(){
  const {data:{session}} = await supabase.auth.getSession();
  setAuth(session);
  if(session) await refresh();
}
function setAuth(session){
  const logged = !!session;
  els.authView.classList.toggle('hidden', logged);
  els.workspace.classList.toggle('hidden', !logged);
  els.logoutBtn.classList.toggle('hidden', !logged);
  syncStatus(logged?'Supabase подключён':'Не подключено', logged);
}
els.authForm.addEventListener('submit', async e=>{
  e.preventDefault(); els.authMessage.textContent='Входим…';
  const {error}=await supabase.auth.signInWithPassword({email:els.email.value.trim(),password:els.password.value});
  els.authMessage.textContent=error?error.message:'Готово';
});
els.signupBtn.addEventListener('click', async ()=>{
  els.authMessage.textContent='Создаём аккаунт…';
  const {data,error}=await supabase.auth.signUp({email:els.email.value.trim(),password:els.password.value,options:{emailRedirectTo:location.href}});
  els.authMessage.textContent=error?error.message:(data.session?'Аккаунт создан.':'Проверь почту для подтверждения регистрации.');
});
els.logoutBtn.addEventListener('click',()=>supabase.auth.signOut());
supabase.auth.onAuthStateChange((_event,session)=>{setAuth(session); if(session) refresh();});

async function refresh(){
  syncStatus('Синхронизация…');
  const [{data:i,error:ie},{data:l,error:le}] = await Promise.all([
    supabase.from('idea_map_ideas').select('*').order('created_at',{ascending:false}),
    supabase.from('idea_map_links').select('*').order('created_at',{ascending:true})
  ]);
  if(ie||le){ syncStatus('Ошибка синхронизации'); console.error(ie||le); return; }
  ideas=(i||[]).map((x,idx)=>({...x,tags:x.tags||[],pos_x:x.pos_x??null,pos_y:x.pos_y??null,_idx:idx}));
  manualLinks=l||[];
  renderAll(); syncStatus('Синхронизировано',true);
}

function defaultPos(idea, idx){
  const c=clusters[idea.cluster]||clusters.inbox;
  const same=ideas.filter(x=>x.cluster===idea.cluster);
  const local=Math.max(0,same.findIndex(x=>x.id===idea.id));
  const angle=(local*2.399963229728653)+(idx*.17);
  const r=35+Math.min(90,22*local);
  return {x:c.cx+Math.cos(angle)*r,y:c.cy+Math.sin(angle)*r};
}
function pos(idea, idx){
  if(Number.isFinite(idea.pos_x)&&Number.isFinite(idea.pos_y)) return {x:idea.pos_x,y:idea.pos_y};
  return defaultPos(idea,idx);
}
function autoLinks(){
  const vis=new Set(visibleIdeas().map(x=>x.id)); const out=[];
  for(let a=0;a<ideas.length;a++) for(let b=a+1;b<ideas.length;b++){
    if(!vis.has(ideas[a].id)||!vis.has(ideas[b].id)) continue;
    const common=overlap(ideas[a],ideas[b]);
    if(common.length && ideas[a].cluster!==ideas[b].cluster) out.push({a:ideas[a].id,b:ideas[b].id,common});
  }
  return out;
}
function renderMap(){
  const vis=visibleIdeas(), visIds=new Set(vis.map(i=>i.id)), auto=autoLinks();
  els.mapEmpty.classList.toggle('hidden',vis.length>0);
  if(!vis.length){els.map.innerHTML='';return;}
  const coords=new Map(vis.map((i,idx)=>[i.id,pos(i,idx)]));
  let s='<defs><filter id="soft"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity=".12"/></filter></defs>';
  Object.entries(clusters).forEach(([key,c])=>{
    if(!vis.some(i=>i.cluster===key)) return;
    s+=`<ellipse class="cluster-zone" cx="${c.cx}" cy="${c.cy}" rx="${c.rx}" ry="${c.ry}" fill="${c.color}" stroke="${c.color}"/><text class="cluster-label" x="${c.cx}" y="${c.cy-c.ry+24}" text-anchor="middle">${esc(c.label)}</text>`;
  });
  auto.forEach(l=>{const a=coords.get(l.a),b=coords.get(l.b);if(a&&b)s+=`<line class="auto-link" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;});
  manualLinks.filter(l=>visIds.has(l.source_id)&&visIds.has(l.target_id)).forEach(l=>{const a=coords.get(l.source_id),b=coords.get(l.target_id);if(a&&b)s+=`<line class="manual-link" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;});
  const neighbors=new Set();
  if(selectedId){
    auto.filter(l=>l.a===selectedId||l.b===selectedId).forEach(l=>{neighbors.add(l.a);neighbors.add(l.b)});
    manualLinks.filter(l=>l.source_id===selectedId||l.target_id===selectedId).forEach(l=>{neighbors.add(l.source_id);neighbors.add(l.target_id)});
  }
  vis.forEach((i,idx)=>{
    const p=coords.get(i.id), c=clusters[i.cluster]||clusters.inbox;
    const dim=selectedId && i.id!==selectedId && !neighbors.has(i.id);
    const label=i.title.length>24?i.title.slice(0,23)+'…':i.title;
    s+=`<g class="node ${selectedId===i.id?'selected':''} ${dim?'dim':''}" data-id="${i.id}" tabindex="0"><circle cx="${p.x}" cy="${p.y}" r="34" fill="${c.color}" filter="url(#soft)"/><text x="${p.x}" y="${p.y+55}" text-anchor="middle">${esc(label)}</text></g>`;
  });
  els.map.innerHTML=s;
  els.map.querySelectorAll('.node').forEach(n=>{
    const activate=()=>{selectedId=n.dataset.id;renderMap();renderSelected();};
    n.addEventListener('click',activate); n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}});
  });
}
function renderSelected(){
  const i=ideas.find(x=>x.id===selectedId);
  els.selected.classList.toggle('hidden',!i); if(!i)return;
  const auto=autoLinks().filter(l=>l.a===i.id||l.b===i.id).length;
  const manual=manualLinks.filter(l=>l.source_id===i.id||l.target_id===i.id).length;
  els.selected.innerHTML=`<p class="eyebrow">${esc((clusters[i.cluster]||clusters.inbox).label)}</p><h3>${esc(i.title)}</h3><p>${esc(i.note||'Без заметки')}</p><p style="margin-top:8px"><b>${auto+manual}</b> связей · ${i.tags.map(esc).join(' · ')||'без тегов'}</p>`;
}
function renderCards(){
  els.cards.innerHTML='';
  visibleIdeas().forEach(i=>{
    const node=els.cardTemplate.content.cloneNode(true), card=node.querySelector('.idea-card');
    const media=node.querySelector('.idea-media');
    media.innerHTML=i.image_data?`<img src="${i.image_data}" alt="">`:'визуал / референс';
    node.querySelector('.idea-kicker').textContent=(clusters[i.cluster]||clusters.inbox).label;
    node.querySelector('h3').textContent=i.title; node.querySelector('.idea-note').textContent=i.note||'Без заметки';
    node.querySelector('.tag-row').innerHTML=i.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('');
    node.querySelector('.edit-btn').addEventListener('click',()=>editIdea(i));
    node.querySelector('.delete-btn').addEventListener('click',()=>deleteIdea(i));
    card.dataset.id=i.id; els.cards.appendChild(node);
  });
}
function renderFilters(){
  const options=[['all','Все'],...Object.entries(clusters).map(([k,v])=>[k,v.label])];
  els.filters.innerHTML='';
  options.forEach(([k,label])=>{const b=document.createElement('button');b.type='button';b.className='chip'+(filter===k?' active':'');b.textContent=label;b.addEventListener('click',()=>{filter=k;renderAll();});els.filters.appendChild(b);});
}
function renderLinkSelects(){
  const options=ideas.map(i=>`<option value="${i.id}">${esc(i.title)}</option>`).join('');
  els.linkSource.innerHTML=options;els.linkTarget.innerHTML=options;
}
function renderAll(){
  els.count.textContent=`${ideas.length} ${ideas.length===1?'идея':'идей'}`;
  renderFilters(); renderMap(); renderSelected(); renderCards(); renderLinkSelects();
}
function resetForm(){els.ideaForm.reset();els.editingId.value='';els.ideaMessage.textContent='';$('#saveIdeaBtn').textContent='Сохранить идею';}
els.resetForm.addEventListener('click',resetForm);
function editIdea(i){els.editingId.value=i.id;els.title.value=i.title;els.cluster.value=i.cluster;els.note.value=i.note||'';els.tags.value=(i.tags||[]).join(', ');$('#saveIdeaBtn').textContent='Сохранить изменения';window.scrollTo({top:0,behavior:'smooth'});}
async function deleteIdea(i){if(!confirm(`Удалить «${i.title}»?`))return;const {error}=await supabase.from('idea_map_ideas').delete().eq('id',i.id);if(error){els.ideaMessage.textContent=error.message;return;}if(selectedId===i.id)selectedId=null;await refresh();}

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    if(!file)return resolve(null);
    if(file.size>650*1024)return reject(new Error('Изображение больше 650 КБ. Сожми его и попробуй снова.'));
    const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Не удалось прочитать изображение.'));r.readAsDataURL(file);
  });
}
els.ideaForm.addEventListener('submit',async e=>{
  e.preventDefault(); els.ideaMessage.textContent='Сохраняем…';
  try{
    const imageData=await fileToDataUrl(els.image.files[0]);
    const payload={title:els.title.value.trim(),cluster:els.cluster.value,note:els.note.value.trim(),tags:parseTags(els.tags.value)};
    if(imageData)payload.image_data=imageData;
    let error;
    if(els.editingId.value){({error}=await supabase.from('idea_map_ideas').update(payload).eq('id',els.editingId.value));}
    else {({error}=await supabase.from('idea_map_ideas').insert(payload));}
    if(error)throw error;resetForm();await refresh();els.ideaMessage.textContent='Сохранено';
  }catch(err){els.ideaMessage.textContent=err.message||String(err);}
});
els.search.addEventListener('input',renderAll);

els.addLink.addEventListener('click',async ()=>{
  const source=els.linkSource.value,target=els.linkTarget.value;
  if(!source||!target){els.linkMessage.textContent='Сначала добавь идеи.';return;}
  if(source===target){els.linkMessage.textContent='Выбери две разные идеи.';return;}
  const {error}=await supabase.from('idea_map_links').insert({source_id:source,target_id:target,relation_type:els.linkType.value});
  els.linkMessage.textContent=error?(error.code==='23505'?'Такая связь уже есть.':error.message):'Связь добавлена.';
  if(!error)await refresh();
});

els.mapMode.addEventListener('click',()=>{mode='map';els.mapView.classList.remove('hidden');els.cards.classList.add('hidden');els.mapMode.classList.add('active');els.cardsMode.classList.remove('active');});
els.cardsMode.addEventListener('click',()=>{mode='cards';els.cards.classList.remove('hidden');els.mapView.classList.add('hidden');els.cardsMode.classList.add('active');els.mapMode.classList.remove('active');});

els.seed.addEventListener('click',async ()=>{
  if(ideas.length && !confirm('Добавить демонстрационные идеи к уже существующим?'))return;
  const seed=[
    {title:'Подарок-конструктор',cluster:'work',note:'Ребёнок собирает и персонализирует подарок сам.',tags:['соучастие','дети','сборка','персонализация']},
    {title:'Город на нитке',cluster:'ohapka',note:'Чокер из символов мест, воспоминаний и людей.',tags:['соучастие','ритуал','личный смысл','сборка']},
    {title:'Круги на воде',cluster:'visual',note:'Слова и смыслы расходятся визуальными волнами.',tags:['визуальный язык','метафора','мерч']},
    {title:'Домашние ритуалы',cluster:'personal',note:'Повторяющиеся действия, которые создают ощущение дома.',tags:['ритуал','личный смысл','повторяемость']},
    {title:'Случайные столкновения идей',cluster:'research',note:'Соединять далёкие идеи и получать новый ход.',tags:['механика','комбинация','исследование','соучастие']},
    {title:'Sticker aesthetic',cluster:'visual',note:'Стрелки, звёзды и линии связи как общий визуальный язык.',tags:['визуальный язык','дети','мерч','модульность']}
  ];
  const {error}=await supabase.from('idea_map_ideas').insert(seed);
  if(error){els.ideaMessage.textContent=error.message;return;}await refresh();
});
getSession();
import * as pdfjs from '../vendor/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
const $ = id => document.getElementById(id);
const state = { docs: [], activeId: null, page: 0, zoom: 'fit', tool: 'select', pendingPoint: null, gesture: null, previewMatches: [], toastTimer: null };
const decoder = new TextDecoder('windows-1252');
const charToByte = new Map();
for (let i = 0; i < 256; i++) charToByte.set(decoder.decode(new Uint8Array([i])), i);
const rgb = (r,g,b) => PDFLib.rgb(r/255,g/255,b/255);

function toast(message) {
  $('toast').textContent = message; $('toast').classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200);
}
function active() { return state.docs.find(d => d.id === state.activeId) || null; }
function safeName(name) { return name.replace(/[\\/:*?"<>|]+/g,'-').replace(/\.pdf$/i,'').slice(0,100) || 'document'; }
function visiblePages(doc) { return Array.from({length:doc.pageCount},(_,i)=>i).filter(i=>!doc.removed.has(i)); }
function pageOrdinal(doc, actualIndex) { return visiblePages(doc).indexOf(actualIndex) + 1; }
function pdfPoint(viewport, px, py) { const p = viewport.convertToPdfPoint(px,py); return {x:p[0],y:p[1]}; }
function viewerPoint(viewport, p) { return viewport.convertToViewportPoint(p.x,p.y); }
function setStatus(s) { $('statusText').textContent = s; }
function getPageRotation(doc, index) { return (doc.rotations[index] || 0) % 360; }

async function openFiles(fileList) {
  const files = [...fileList].filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
  if (!files.length) { toast('Choose PDF files to open.'); return; }
  let added = 0;
  for (const file of files) {
    if (state.docs.some(d => d.name === file.name && d.size === file.size)) { toast(file.name + ' is already open.'); continue; }
    if (file.size > 100*1024*1024) { toast(file.name + ' exceeds the 100 MB per-file limit.'); continue; }
    try {
      setStatus('Opening ' + file.name + '…');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({data:bytes.slice(), useSystemFonts:true}).promise;
      if (pdf.numPages > 500) { await pdf.destroy(); toast(file.name + ' has over 500 pages.'); continue; }
      const doc = {id:crypto.randomUUID(),name:file.name,size:file.size,originalBytes:bytes,bytes:bytes.slice(),pdf,pageCount:pdf.numPages,annotations:[],rotations:{},removed:new Set(),bulkChanges:0,sourceType:file.type};
      try { doc.outline = await pdf.getOutline(); } catch { doc.outline = null; }
      state.docs.push(doc); state.activeId = doc.id; state.page = 0; added++;
    } catch(e) { toast('Could not open ' + file.name + ': ' + (e.message || 'Invalid or protected PDF.')); }
  }
  renderAll();
  if (added) toast(added + ' PDF document(s) ready. Files stay on this device.');
  setStatus(navigator.onLine ? 'Ready · local processing' : 'Offline · local processing');
  $('fileInput').value = '';
}
function switchDocument(id) {
  state.activeId=id; const d=active(); state.page=d ? (visiblePages(d)[0] ?? 0) : 0; state.gesture=null; renderAll();
}
function renderDocuments() {
  const box=$('documents'); box.replaceChildren();
  $('docCount').textContent=String(state.docs.length);
  if(!state.docs.length){const x=document.createElement('div');x.className='welcome-mini';x.innerHTML='<span>▤</span><b>No documents yet</b><small>Open one or more PDFs to start.</small>';box.append(x);return;}
  for(const d of state.docs){
    const b=document.createElement('button');b.type='button';b.className='doc-item'+(d.id===state.activeId?' active':'');
    const icon=document.createElement('span');icon.className='doc-icon';icon.textContent='PDF';
    const info=document.createElement('span');info.className='doc-info';
    const name=document.createElement('b');name.textContent=d.name;
    const meta=document.createElement('small');meta.textContent=d.pageCount+' pages'+(d.bulkChanges?' · '+d.bulkChanges+' text changes':'');
    info.append(name,meta);b.append(icon,info);
    const rm=document.createElement('button');rm.type='button';rm.className='doc-remove';rm.textContent='×';rm.title='Close document';
    rm.addEventListener('click',e=>{e.stopPropagation();closeDocument(d.id);});
    b.addEventListener('click',()=>switchDocument(d.id));b.append(rm);box.append(b);
  }
}
function closeDocument(id){const d=state.docs.find(x=>x.id===id);if(d?.pdf)try{d.pdf.destroy()}catch{};state.docs=state.docs.filter(x=>x.id!==id);if(state.activeId===id){state.activeId=state.docs[0]?.id||null;state.page=0;}renderAll();}
function renderAll(){renderDocuments();renderCurrent();renderThumbnails();renderAnnotationsList();}
function getCurrentPage(doc){if(!doc)return null;const v=visiblePages(doc);if(!v.length)return null;if(!v.includes(state.page))state.page=v[0];return state.page;}
function updateNavigation(doc){
  const vis=doc?visiblePages(doc):[];const ordinal=doc?pageOrdinal(doc,state.page):0;
  $('prevPage').disabled=!doc||ordinal<=1;$('nextPage').disabled=!doc||ordinal>=vis.length;
  $('pageNumber').disabled=!doc;$('pageNumber').max=String(vis.length||1);$('pageNumber').value=String(ordinal||1);
  $('pageCount').textContent='of '+vis.length;$('saveBtn').disabled=!doc;
}
function renderCurrent(){
  const d=active();$('emptyState').hidden=!!d;$('viewer').hidden=!d;updateNavigation(d);
  if(!d){$('fileName').textContent='No document open';$('fileMeta').textContent='Open a PDF to get started';$('pageStack').replaceChildren();$('zoomValue').textContent='Fit';setStatus('Ready');renderAnnotationsList();return;}
  getCurrentPage(d);$('fileName').textContent=d.name;
  $('fileMeta').textContent=d.pageCount+' pages · '+formatBytes(d.size)+(d.bulkChanges?' · '+d.bulkChanges+' text replacements':'');
  $('pageStack').replaceChildren();const loading=document.createElement('div');loading.className='welcome-mini';loading.textContent='Rendering page…';$('pageStack').append(loading);
  renderPage(d,state.page).catch(e=>{if(active()?.id===d.id){$('pageStack').replaceChildren();const x=document.createElement('div');x.className='welcome-mini';x.textContent='This page could not be rendered: '+e.message;$('pageStack').append(x);}});
}
function formatBytes(n){return n<1024*1024?(n/1024).toFixed(0)+' KB':(n/1024/1024).toFixed(1)+' MB';}
function targetScale(page,rotation){
  const vp=page.getViewport({scale:1,rotation});const viewer=$('viewer');
  if(state.zoom!=='fit'&&state.zoom!=='width')return Number(state.zoom)/100;
  const width=Math.max(180,viewer.clientWidth-42),height=Math.max(240,viewer.clientHeight-42);
  const scale=state.zoom==='width'?width/vp.width:Math.min(width/vp.width,height/vp.height);
  return Math.max(.35,Math.min(scale,2.4));
}
async function renderPage(doc,index){
  if(!doc||doc.removed.has(index))return;
  const version=doc.id+':'+index+':'+state.zoom+':'+getPageRotation(doc,index);
  const pdfPage=await doc.pdf.getPage(index+1);if(active()?.id!==doc.id||state.page!==index)return;
  const rot=(pdfPage.rotate+getPageRotation(doc,index))%360;const scale=targetScale(pdfPage,rot);const viewport=pdfPage.getViewport({scale,rotation:rot});
  $('zoomValue').textContent=Math.round(scale*100)+'%';
  const wrap=document.createElement('div');wrap.className='pdf-page-wrap';wrap.style.width=viewport.width+'px';wrap.style.height=viewport.height+'px';
  const canvas=document.createElement('canvas');const ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
  wrap.append(canvas);const layer=document.createElement('div');layer.className='annotation-layer';layer.dataset.page=String(index);wrap.append(layer);
  $('pageStack').replaceChildren(wrap);
  await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;
  if(active()?.id!==doc.id||state.page!==index)return;
  wrap.dataset.renderKey=version;renderAnnotationLayer(doc,index,layer,viewport);
  installPageInteraction(doc,index,layer,viewport);
  updateNavigation(doc);setStatus('Page '+(pageOrdinal(doc,index))+' of '+visiblePages(doc).length);
}
function renderAnnotationLayer(doc,index,layer,viewport){
  layer.replaceChildren();
  const anns=doc.annotations.filter(a=>a.page===index);
  for(const a of anns){
    if(a.type==='note'){const p=viewerPoint(viewport,a.point);const n=document.createElement('div');n.className='annotation-item note';n.textContent=a.text;n.style.left=p[0]+'px';n.style.top=p[1]+'px';layer.append(n);}
    else if(a.type==='highlight'){const p1=viewerPoint(viewport,{x:a.rect.x1,y:a.rect.y1}),p2=viewerPoint(viewport,{x:a.rect.x2,y:a.rect.y2});const h=document.createElement('div');h.className='annotation-item highlight';h.style.left=Math.min(p1[0],p2[0])+'px';h.style.top=Math.min(p1[1],p2[1])+'px';h.style.width=Math.max(2,Math.abs(p2[0]-p1[0]))+'px';h.style.height=Math.max(2,Math.abs(p2[1]-p1[1]))+'px';layer.append(h);}
    else if(a.type==='draw'&&a.points.length){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');poly.setAttribute('fill','none');poly.setAttribute('stroke','#e16d45');poly.setAttribute('stroke-width','2.6');poly.setAttribute('stroke-linejoin','round');poly.setAttribute('stroke-linecap','round');poly.setAttribute('points',a.points.map(pt=>{const p=viewerPoint(viewport,pt);return p[0]+','+p[1]}).join(' '));svg.append(poly);layer.append(svg);}
  }
}
function installPageInteraction(doc,index,layer,viewport){
  layer.style.cursor=state.tool==='text'?'text':(state.tool==='select'?'default':'crosshair');
  layer.onpointerdown=e=>{
    if(state.tool==='select')return;
    const r=layer.getBoundingClientRect();const p=pdfPoint(viewport,e.clientX-r.left,e.clientY-r.top);
    if(state.tool==='text'){state.pendingPoint={page:index,point:p};$('annotationText').value='';$('textDialog').showModal();$('annotationText').focus();return;}
    if(state.tool==='highlight'||state.tool==='draw'){state.gesture={docId:doc.id,page:index,type:state.tool,points:[p],viewport,layer};layer.setPointerCapture(e.pointerId);e.preventDefault();}
  };
  layer.onpointermove=e=>{
    const g=state.gesture;if(!g||g.layer!==layer)return;const r=layer.getBoundingClientRect();g.points.push(pdfPoint(viewport,e.clientX-r.left,e.clientY-r.top));
    const existing=layer.querySelector('.gesture-preview');if(existing)existing.remove();
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('gesture-preview');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    if(g.type==='draw'){const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');poly.setAttribute('fill','none');poly.setAttribute('stroke','#e16d45');poly.setAttribute('stroke-width','2.6');poly.setAttribute('points',g.points.map(pt=>{const q=viewerPoint(viewport,pt);return q[0]+','+q[1]}).join(' '));svg.append(poly);}
    else{const a=viewerPoint(viewport,g.points[0]),b=viewerPoint(viewport,g.points[g.points.length-1]);const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('x',Math.min(a[0],b[0]));rect.setAttribute('y',Math.min(a[1],b[1]));rect.setAttribute('width',Math.max(4,Math.abs(a[0]-b[0])));rect.setAttribute('height',Math.max(4,Math.abs(a[1]-b[1])));rect.setAttribute('fill','#f7e85b55');rect.setAttribute('stroke','#c4a92a');svg.append(rect);}
    layer.append(svg);
  };
  layer.onpointerup=e=>{
    const g=state.gesture;if(!g||g.layer!==layer)return;state.gesture=null;const pts=g.points;const preview=layer.querySelector('.gesture-preview');if(preview)preview.remove();
    if(g.type==='highlight'){let a=pts[0],b=pts[pts.length-1];if(Math.abs(a.x-b.x)<5&&Math.abs(a.y-b.y)<5)b={x:a.x+150,y:a.y-15};doc.annotations.push({id:crypto.randomUUID(),type:'highlight',page:index,rect:{x1:Math.min(a.x,b.x),y1:Math.min(a.y,b.y),x2:Math.max(a.x,b.x),y2:Math.max(a.y,b.y)}});}
    else {if(pts.length===1)pts.push({x:pts[0].x+6,y:pts[0].y-6});doc.annotations.push({id:crypto.randomUUID(),type:'draw',page:index,points:pts.slice()});}
    renderAnnotationLayer(doc,index,layer,viewport);renderAnnotationsList();
  };
}
function renderThumbnails(){
  const d=active(),box=$('thumbnails');box.replaceChildren();$('outline').hidden=true;box.hidden=false;
  if(!d){const x=document.createElement('div');x.className='welcome-mini';x.innerHTML='<span>▤</span><b>Your pages appear here</b><small>Open a PDF to see page previews.</small>';box.append(x);return;}
  const pages=visiblePages(d);
  if(!pages.length){box.textContent='No pages remain in this copy.';return;}
  const observer=('IntersectionObserver'in window)?new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){observer.unobserve(entry.target);renderThumb(d,Number(entry.target.dataset.page),entry.target);}}},{root:box,rootMargin:'180px'}):null;
  for(const index of pages){const b=document.createElement('button');b.type='button';b.className='thumb'+(index===state.page?' active':'');b.dataset.page=String(index);const placeholder=document.createElement('div');placeholder.className='thumb-canvas-placeholder';placeholder.style.cssText='width:112px;height:145px;background:#f7f8fa;box-shadow:0 4px 12px #0003;border-radius:2px';b.append(placeholder);const n=document.createElement('span');n.className='thumb-num';n.textContent='Page '+pageOrdinal(d,index);b.append(n);b.onclick=()=>{state.page=index;renderCurrent();renderThumbnails()};box.append(b);if(observer)observer.observe(b);else renderThumb(d,index,b);}
  if(observer&&pages.length<18)for(const b of box.querySelectorAll('.thumb')){observer.unobserve(b);renderThumb(d,Number(b.dataset.page),b);}
}
async function renderThumb(doc,index,button){
  if(!button.isConnected||doc.id!==state.activeId)return;
  try{const p=await doc.pdf.getPage(index+1);const vp=p.getViewport({scale:112/p.getViewport({scale:1}).width,rotation:(p.rotate+getPageRotation(doc,index))%360});const c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);c.style.width=Math.min(112,vp.width)+'px';c.style.height='auto';await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;if(!button.isConnected)return;const old=button.querySelector('.thumb-canvas-placeholder,canvas');if(old)old.replaceWith(c);else button.prepend(c);}catch{}
}
function renderAnnotationsList(){
 const d=active(),box=$('annotationList');box.replaceChildren();const anns=d?d.annotations:[];
 $('annotationCount').textContent=String(anns.length);
 if(!anns.length){const e=document.createElement('div');e.className='annotation-empty';e.textContent='Your notes and highlights will show up here.';box.append(e);return;}
 for(const a of anns.slice().reverse()){const row=document.createElement('div');row.className='annotation-row';const info=document.createElement('div');info.style.flex='1';const b=document.createElement('b');b.textContent=a.type==='note'?'Text note':a.type==='highlight'?'Highlight':'Freehand mark';const small=document.createElement('small');small.textContent='Page '+(a.page+1)+(a.type==='note'?' · '+a.text.slice(0,45):'');info.append(b,small);const del=document.createElement('button');del.textContent='×';del.title='Remove annotation';del.onclick=()=>{d.annotations=d.annotations.filter(x=>x.id!==a.id);renderAnnotationsList();renderCurrent()};row.append(info,del);box.append(row);}
}
function setTool(tool){state.tool=tool;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));if(active())renderCurrent();if(tool!=='select')toast(tool==='text'?'Click on the page to place a text note.':tool==='highlight'?'Drag across an area to highlight it.':'Draw on the page with your pointer.');}
function goPageOrdinal(n){const d=active();if(!d)return;const pages=visiblePages(d);if(!pages.length)return;const ordinal=Math.max(1,Math.min(pages.length,Math.floor(n)||1));state.page=pages[ordinal-1];renderCurrent();renderThumbnails();}
async function changeZoom(next){state.zoom=next;$('zoomFit').value=['fit','width','100','125','150','200'].includes(next)?next:'100';if(active())await renderPage(active(),state.page).catch(()=>{});}
function openModal(id){if($(id)?.showModal)$(id).showModal();}
function closeModal(id){if($(id)?.close)$(id).close();}

function bytesToString(bytes){let s='';for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return s;}
function stringToBytes(s){return Uint8Array.from(s,c=>c.charCodeAt(0)&255);}
function decodePdfLiteral(raw){
 const out=[];for(let i=1;i<raw.length-1;i++){let ch=raw[i];if(ch==='\\'){const n=raw[++i];if(n===undefined)break;if(/[0-7]/.test(n)){let oct=n;for(let k=0;k<2&&/[0-7]/.test(raw[i+1]||'');k++)oct+=raw[++i];out.push(parseInt(oct,8)&255);}else if(n==='\r'||n==='\n'){if(n==='\r'&&raw[i+1]==='\n')i++;}else{const map={n:10,r:13,t:9,b:8,f:12};out.push(map[n]??n.charCodeAt(0));}}else out.push(ch.charCodeAt(0)&255);}
 return decoder.decode(new Uint8Array(out));
}
function encodePdfLiteral(text){
 let s='(';for(const ch of text){const b=charToByte.get(ch);if(b===undefined)throw new Error('The replacement includes a character this PDF text encoding cannot safely represent: '+ch);if(b<32||b>126)s+='\\'+b.toString(8).padStart(3,'0');else if(b===40||b===41||b===92)s+='\\'+String.fromCharCode(b);else s+=String.fromCharCode(b);}return s+')';
}
function tokenizeContent(source){
 const out=[];let i=0;
 while(i<source.length){if(/\s/.test(source[i])){i++;continue;}if(source[i]==='%'){while(i<source.length&&source[i]!=='\n')i++;continue;}
  const start=i,ch=source[i++];
  if(ch==='('){let depth=1;while(i<source.length&&depth){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='(')depth++;else if(source[i]===')')depth--;i++;}out.push({type:'string',raw:source.slice(start,i),start,end:i});continue;}
  if(ch==='<'){if(source[i]==='<'){i++;out.push({type:'word',raw:'<<',start,end:i});continue;}while(i<source.length&&source[i]!=='>')i++;i++;out.push({type:'hex',raw:source.slice(start,i),start,end:i});continue;}
  if(ch==='['||ch===']'){out.push({type:'word',raw:ch,start,end:i});continue;}
  while(i<source.length&&!/[\s()[\]<>]/.test(source[i]))i++;
  out.push({type:ch==='/'?'name':'word',raw:source.slice(start,i),start,end:i});
 }
 return out;
}
function countMatches(haystack,needle,caseSensitive){
 if(!needle)return 0;const source=caseSensitive?haystack:haystack.toLocaleLowerCase(),query=caseSensitive?needle:needle.toLocaleLowerCase();let count=0,pos=0;while((pos=source.indexOf(query,pos))!==-1){count++;pos+=query.length;}return count;
}
function replaceMatches(haystack,needle,replacement,caseSensitive){
 if(caseSensitive)return haystack.split(needle).join(replacement);
 return haystack.replace(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),()=>replacement);
}
async function contentStreamText(page,lib){
 const contents=page.node.Contents();if(!contents)return '';
 const streams=contents instanceof lib.PDFArray?contents.asArray().map(r=>page.doc.context.lookup(r)):[contents];
 return streams.map(stream=>bytesToString(lib.decodePDFRawStream(stream).decode())).join('\n');
}
async function readTextOperators(bytes){
 const pdf=await PDFLib.PDFDocument.load(bytes,{updateMetadata:false,ignoreEncryption:false});const pages=[];
 for(let i=0;i<pdf.getPageCount();i++){
  const p=pdf.getPage(i);const stream=await getPageSource(p,pdf);const tokens=tokenizeContent(stream);let matches=[];
  for(let k=0;k<tokens.length-1;k++)if(tokens[k].type==='string'&&tokens[k+1].raw==='Tj'){matches.push({start:tokens[k].start,end:tokens[k].end,raw:tokens[k].raw,text:decodePdfLiteral(tokens[k].raw)});}
  pages.push({index:i,source:stream,matches});
 }
 return {pdf,pages};
}
async function getPageSource(page,pdf){
 const contents=page.node.Contents();if(!contents)return '';
 const streams=contents instanceof PDFLib.PDFArray?contents.asArray().map(ref=>pdf.context.lookup(ref)):[contents];
 return streams.map(s=>bytesToString(PDFLib.decodePDFRawStream(s).decode())).join('\n');
}
async function previewReplacement(){
 const from=$('findText').value;const to=$('replaceText').value;const caseSensitive=$('caseSensitive').checked;
 if(!from){toast('Enter the text you want to find.');return;}
 if(from===to){toast('Find text and replacement are identical.');return;}
 const docs=bulkTargets();if(!docs.length){toast('Open at least one PDF first.');return;}
 $('previewBulk').disabled=true;$('applyBulk').disabled=true;$('bulkResults').hidden=false;$('bulkResults').replaceChildren();setStatus('Scanning text operators…');
 const results=[];
 try{
  for(const d of docs){const parsed=await readTextOperators(d.bytes);let count=0;for(const p of parsed.pages)for(const m of p.matches)count+=countMatches(m.text,from,caseSensitive);results.push({doc:d,count});}
  state.previewMatches=results;
  for(const r of results){const row=document.createElement('div');row.className='bulk-result-row';const n=document.createElement('span');n.textContent=r.doc.name;const c=document.createElement('b');c.textContent=r.count+' match'+(r.count===1?'':'es');row.append(n,c);$('bulkResults').append(row);}
  const total=results.reduce((n,r)=>n+r.count,0);const line=document.createElement('div');line.className='bulk-total';line.textContent=total+' match(es) found in '+results.filter(r=>r.count).length+' document(s).';$('bulkResults').append(line);
  $('applyBulk').disabled=total===0;setStatus('Preview complete');if(total===0)toast('No supported text-string matches found. The text may be split, encoded or scanned.');else toast('Preview ready. Review the count before replacing.');
 }catch(e){toast('Preview failed: '+e.message);setStatus('Preview failed');}
 finally{$('previewBulk').disabled=false;}
}
function bulkTargets(){const d=active();return $('bulkScope').value==='current'?(d?[d]:[]):state.docs.slice();}
async function performReplacement(doc,from,to,caseSensitive){
 const parsed=await readTextOperators(doc.bytes);let total=0;
 for(const p of parsed.pages){
  let source=p.source;const edits=[];
  for(const m of p.matches){const count=countMatches(m.text,from,caseSensitive);if(!count)continue;
   const changed=replaceMatches(m.text,from,to,caseSensitive);const encoded=encodePdfLiteral(changed);edits.push({start:m.start,end:m.end,text:encoded});total+=count;
  }
  for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);
  if(edits.length){const stream=parsed.pdf.context.flateStream(stringToBytes(source));const page=parsed.pdf.getPage(p.index);page.node.set(PDFLib.PDFName.of('Contents'),parsed.pdf.context.register(stream));}
 }
 if(total)doc.bytes=await parsed.pdf.save({useObjectStreams:false});
 return total;
}
async function applyBulk(){
 const from=$('findText').value,to=$('replaceText').value,caseSensitive=$('caseSensitive').checked;const results=state.previewMatches.filter(r=>r.count>0);
 if(!results.length){toast('Preview matches before replacing.');return;}
 if(!to && !confirm('The replacement text is blank. This will remove every match. Continue?'))return;
 $('applyBulk').disabled=true;$('previewBulk').disabled=true;let changedFiles=0,total=0;
 try{
  for(const item of results){setStatus('Updating '+item.doc.name+'…');const count=await performReplacement(item.doc,from,to,caseSensitive);if(count){item.doc.bulkChanges+=count;item.doc.pdf?.destroy();item.doc.pdf=await pdfjs.getDocument({data:item.doc.bytes.slice(),useSystemFonts:true}).promise;item.doc.pageCount=item.doc.pdf.numPages;changedFiles++;total+=count;}}
  renderAll();$('bulkResults').replaceChildren();const info=document.createElement('div');info.className='bulk-total';info.textContent='Replaced '+total+' occurrence(s) in '+changedFiles+' PDF(s). Export each edited copy below.';$('bulkResults').append(info);
  for(const item of results){if(!item.doc.bulkChanges)continue;const row=document.createElement('div');row.className='bulk-result-row';const name=document.createElement('span');name.textContent=item.doc.name;const button=document.createElement('button');button.type='button';button.className='btn secondary';button.textContent='Download copy';button.onclick=()=>downloadEdited(item.doc);row.append(name,button);$('bulkResults').append(row);}
  toast('Batch replacement complete. Original files remain unchanged.');setStatus('Batch replacement complete');
 }catch(e){toast('Replacement stopped: '+e.message+'. Exported files were not created.');setStatus('Replacement error');}
 finally{$('applyBulk').disabled=false;$('previewBulk').disabled=false;}
}
async function exportDoc(doc){
 const pdf=await PDFLib.PDFDocument.load(doc.bytes,{updateMetadata:false});const font=await pdf.embedFont(PDFLib.StandardFonts.Helvetica);const pages=pdf.getPages();
 for(let i=0;i<pages.length;i++){
  const page=pages[i];const rotation=getPageRotation(doc,i);if(rotation)page.setRotation(PDFLib.degrees(((page.getRotation().angle||0)+rotation)%360));
  for(const a of doc.annotations.filter(x=>x.page===i)){
   if(a.type==='note'){const size=11;const w=Math.max(48,Math.min(400,a.text.length*size*.56+12));page.drawRectangle({x:a.point.x,y:a.point.y-5,width:w,height:20,color:rgb(255,242,169),opacity:.93,borderColor:rgb(231,201,73),borderWidth:.7});page.drawText(a.text,{x:a.point.x+5,y:a.point.y+1,size,font,color:rgb(35,35,35),maxWidth:Math.max(30,w-10),lineHeight:14});}
   else if(a.type==='highlight'){const x=Math.min(a.rect.x1,a.rect.x2),y=Math.min(a.rect.y1,a.rect.y2);page.drawRectangle({x,y,width:Math.max(2,Math.abs(a.rect.x2-a.rect.x1)),height:Math.max(2,Math.abs(a.rect.y2-a.rect.y1)),color:rgb(255,232,83),opacity:.36,borderColor:rgb(210,177,31),borderWidth:.4});}
   else if(a.type==='draw'){for(let j=1;j<a.points.length;j++)page.drawLine({start:a.points[j-1],end:a.points[j],thickness:2,color:rgb(225,109,69),opacity:.95});}
  }
 }
 for(const i of [...doc.removed].sort((a,b)=>b-a))if(i>=0&&i<pdf.getPageCount()&&pdf.getPageCount()>1)pdf.removePage(i);
 return await pdf.save({useObjectStreams:false});
}
function triggerDownload(bytes,name){
 const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),45000);
}
async function downloadEdited(doc){
 try{setStatus('Preparing '+doc.name+'…');const bytes=await exportDoc(doc);triggerDownload(bytes,safeName(doc.name)+'-edited.pdf');setStatus('Export ready');toast('Edited copy downloaded.');}
 catch(e){toast('Could not export '+doc.name+': '+e.message);setStatus('Export failed');}
}
async function downloadOriginal(doc){if(!doc)return;triggerDownload(doc.originalBytes,doc.name);toast('Original copy downloaded.');}
async function printDocument(){
 const d=active();if(!d)return;try{const bytes=await exportDoc(d);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const w=window.open(url,'_blank','noopener');if(!w)toast('Allow pop-ups to open the PDF for printing.');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){toast('Could not prepare PDF for printing: '+e.message);}
}
function gotoNext(delta){const d=active();if(!d)return;const vis=visiblePages(d);const i=vis.indexOf(state.page);const n=Math.max(0,Math.min(vis.length-1,i+delta));state.page=vis[n];renderCurrent();renderThumbnails();}
function deleteCurrentPage(){const d=active();if(!d)return;const vis=visiblePages(d);if(vis.length<=1){toast('At least one page must remain in the exported PDF.');return;}d.removed.add(state.page);const next=visiblePages(d);state.page=next[Math.min(vis.indexOf(state.page),next.length-1)];$('confirmLayer').hidden=true;renderAll();toast('Page marked for removal from the exported copy.');}

$('openBtn').onclick=()=> $('fileInput').click();$('emptyOpenBtn').onclick=()=> $('fileInput').click();$('addMoreBtn').onclick=()=> $('fileInput').click();$('fileInput').onchange=e=>openFiles(e.target.files);
$('saveBtn').onclick=()=>{const d=active();if(d)downloadEdited(d);};$('exportCurrentBtn').onclick=()=>{const d=active();if(d)downloadEdited(d);else toast('Open a PDF first.');};
$('originalBtn').onclick=()=>downloadOriginal(active());$('printBtn').onclick=printDocument;$('printRightBtn').onclick=printDocument;
$('bulkBtn').onclick=()=>{state.previewMatches=[];$('bulkResults').hidden=true;$('applyBulk').disabled=true;openModal('bulkDialog');};$('bulkRightBtn').onclick=$('bulkBtn').onclick;
$('closeBulk').onclick=$('cancelBulk').onclick=()=>closeModal('bulkDialog');$('previewBulk').onclick=previewReplacement;$('applyBulk').onclick=applyBulk;
$('prevPage').onclick=()=>gotoNext(-1);$('nextPage').onclick=()=>gotoNext(1);$('pageNumber').onchange=e=>goPageOrdinal(Number(e.target.value));
$('zoomFit').onchange=e=>changeZoom(e.target.value);$('zoomOut').onclick=()=>changeZoom(String(Math.max(50,Math.round((Number(state.zoom)||100)-10))));$('zoomIn').onclick=()=>changeZoom(String(Math.min(250,Math.round((Number(state.zoom)||100)+10))));
$('rotateBtn').onclick=()=>{const d=active();if(!d)return;d.rotations[state.page]=((getPageRotation(d,state.page)+90)%360);renderCurrent();renderThumbnails();};
$('fullScreenBtn').onclick=async()=>{try{if(!document.fullscreenElement)await $('viewer').requestFullscreen();else await document.exitFullscreen();}catch{toast('Fullscreen is not available in this browser.');}};
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('textForm').onsubmit=e=>{e.preventDefault();const d=active(),p=state.pendingPoint,text=$('annotationText').value.trim();if(!d||!p||!text){toast('Enter a note first.');return;}d.annotations.push({id:crypto.randomUUID(),type:'note',page:p.page,point:p.point,text});closeModal('textDialog');renderAnnotationsList();renderCurrent();toast('Text note added.');};
$('cancelText').onclick=$('cancelText2').onclick=()=>closeModal('textDialog');
$('deletePageBtn').onclick=()=>{if(!active())return; $('confirmLayer').hidden=false;};$('cancelDelete').onclick=()=>{$('confirmLayer').hidden=true;};$('confirmDelete').onclick=deleteCurrentPage;
document.querySelectorAll('.panel-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.panel-tab').forEach(x=>x.classList.toggle('active',x===b));const outline=b.dataset.panel==='outline';$('thumbnails').hidden=outline;$('outline').hidden=!outline;if(outline)renderOutline(active());});
function renderOutline(doc){const box=$('outline');box.replaceChildren();if(!doc?.outline?.length){const p=document.createElement('p');p.className='muted';p.textContent='No document outline is available.';box.append(p);return;}function walk(items,depth=0){for(const item of items){const b=document.createElement('button');b.textContent='　'.repeat(Math.min(depth,4))+item.title;b.onclick=async()=>{try{const dest=await doc.pdf.getDestination(item.dest);if(dest){const ref=dest[0];const index=await doc.pdf.getPageIndex(ref);state.page=index;renderCurrent();renderThumbnails();}}catch{toast('Could not jump to this outline item.');}};box.append(b);if(item.items?.length)walk(item.items,depth+1);}}walk(doc.outline);}
$('themeBtn').onclick=()=>{document.body.classList.toggle('light');try{localStorage.setItem('pdf-studio-reader-theme',document.body.classList.contains('light')?'light':'dark');}catch{}};
try{if(localStorage.getItem('pdf-studio-reader-theme')==='light')document.body.classList.add('light');}catch{}
window.addEventListener('resize',()=>{if(active()&&state.zoom==='fit')renderCurrent();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('confirmLayer').hidden)$('confirmLayer').hidden=true;return;}if(e.ctrlKey&&e.key.toLowerCase()==='o'){e.preventDefault();$('fileInput').click();}if(e.key==='ArrowLeft'&&!e.target.matches('input,textarea,select'))gotoNext(-1);if(e.key==='ArrowRight'&&!e.target.matches('input,textarea,select'))gotoNext(1);});
if('serviceWorker'in navigator){navigator.serviceWorker.register('../sw.js',{scope:'../',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});}
renderAll();

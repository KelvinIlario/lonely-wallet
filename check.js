

const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), pct=v=>`${Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}%`;
const labels={acao:'Ações',fii:'FIIs',etf:'ETFs',bdr:'BDRs',internacional:'ETFs Internacionais',renda_fixa:'Renda Fixa',cripto:'Criptomoedas',stocks:'Stocks',reit:'REITs',tesouro:'Tesouro Direto',fundo:'Fundos de Investimentos',outros:'Outros'};let state={itens:[],resumo:{},alocacao:{},operacoes:[],proventos:[],metas:[]};let charts={};let operationGroupPages={};let operationGroupsData=[];const OPERATION_GROUP_PAGE_SIZE=15;let provGroupPages={};let provGroupedRows={};let provDistributionData={ativo:[],tipo:[]};let provDistributionMode="ativo";let provDistributionStatus="Pago";let provTotalPeriod="12m";let provChartRange="todos";let editingOperationId=null;let irpfData={posicoes:[],rendimentos:[],operacoes:[],resumo:{}};let darfItems=[];let activeIRPFTab='bens';
let expandedAssetGroups={};
// Estado independente dos grupos exibidos na página Resumo.
let summaryExpandedAssetGroups={};
let summaryDraggedCategory="";
let distributionItems=[];const distributionColors=['#4b91f5','#7df0b2','#ffdc65','#ff7181','#54d5ef','#bd9af4','#e8a56b','#6fc4a8','#b9c3d3'];
let refreshInFlight=null,mutationRefreshTimer=null,refreshAgain=false;
function scheduleMutationRefresh(){
 if(mutationRefreshTimer)clearTimeout(mutationRefreshTimer);
 mutationRefreshTimer=setTimeout(()=>{
  mutationRefreshTimer=null;
  refresh();
 },80);
}
async function api(url,opts={}){
 const method=String(opts.method||'GET').toUpperCase();
 const controller=opts.signal?null:new AbortController();
 const requestOptions={headers:{'Content-Type':'application/json'},...opts,...(controller?{signal:controller.signal}:{})};
 const timeout=controller?setTimeout(()=>controller.abort(),25000):null;
 let r;try{r=await fetch(url,requestOptions);}finally{if(timeout)clearTimeout(timeout);}
 let d={};
 try{d=await r.json();}catch(error){if(r.ok)throw new Error('O servidor não retornou uma resposta válida.');}
 if(!r.ok)throw new Error(d.erro||d.error||d.message||'Não foi possível concluir a operação.');
 if(['POST','PUT','PATCH','DELETE'].includes(method)&&!opts.skipAutoRefresh)scheduleMutationRefresh();
 return d;
}
function chart(id,type,data,options={}){if(!document.getElementById(id))return;if(charts[id])charts[id].destroy();charts[id]=new Chart(document.getElementById(id),{type,data,options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#b8c1ce',boxWidth:9,font:{size:11}}}},scales:type==='bar'?{x:{ticks:{color:'#8f99a8'},grid:{color:'#303541'}},y:{ticks:{color:'#8f99a8'},grid:{color:'#303541'}}}:{},...options}})}
function stat(label,value,sub='',color=''){return `<div class="card stat"><div class="statlabel">${label}</div><div class="statvalue ${color}">${value}</div><div class="mini">${sub}</div></div>`}
function rowEmpty(cols,msg='Nenhum registro encontrado.'){return `<tr><td colspan="${cols}" class="empty">${msg}</td></tr>`}
async function refresh(){
 if(mutationRefreshTimer){clearTimeout(mutationRefreshTimer);mutationRefreshTimer=null;}
 if(refreshInFlight){refreshAgain=true;return refreshInFlight;}
 refreshInFlight=(async()=>{
  try{
   const dashboardAttempts=4;let dashboardError=null;
   for(let attempt=0;attempt<dashboardAttempts;attempt++){
    try{state=await api('/api/dashboard');dashboardError=null;break;}
    catch(error){dashboardError=error;if(attempt<dashboardAttempts-1){await new Promise(resolve=>setTimeout(resolve,650*Math.pow(2,attempt)));}}
   }
   if(dashboardError)throw dashboardError;
   render();
   applyPositionColumnPrefs();
   const updated=document.getElementById('updated');
   if(updated)updated.textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
   const irpfPage=document.getElementById('page-irpf');
   const darfPage=document.getElementById('page-darfs');
   if(irpfPage&&!irpfPage.classList.contains('hidden'))await loadIRPF();
   if(darfPage&&!darfPage.classList.contains('hidden'))await loadDARFs();
   return state;
  }catch(e){toast(`Não foi possível carregar a carteira: ${e.message}`);return null;}
  finally{
   const loader=document.getElementById('loadingScreen');
   if(loader)loader.classList.add('done');
  }
 })();
 try{return await refreshInFlight;}
 finally{
  refreshInFlight=null;
  if(refreshAgain){refreshAgain=false;Promise.resolve().then(()=>refresh());}
 }
}



function categoryKeyFromName(name){
 const n=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
 if(n==='acoes'||n==='acao')return 'acao';
 if(n==='fiis'||n==='fii'||n.includes('fundo imobiliario'))return 'fii';
 if(n==='renda fixa')return 'renda_fixa';
 if(n==='tesouro direto')return 'tesouro';
 if(n.includes('fundos de investimento'))return 'fundo';
 if(n==='etfs'||n==='etf')return 'etf';
 if(n.includes('etfs internacionais')||n==='internacional')return 'internacional';
 if(n==='stocks'||n==='stock')return 'stocks';
 if(n==='reits'||n==='reit')return 'reit';
 if(n==='bdrs'||n==='bdr')return 'bdr';
 if(n.includes('cripto'))return 'cripto';
 if(n==='outros'||n==='outro')return 'outros';
 return null;
}

function readAssetNoteData(ticker){
 let raw={};try{raw=JSON.parse(localStorage.getItem(noteStorageKey(ticker))||'{}')}catch(e){}
 // Compatibilidade com observações salvas nas versões anteriores.
 if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
 const entries=raw.entries&&typeof raw.entries==='object'?raw.entries:Object.fromEntries(Object.entries(raw).filter(([key,value])=>/^\d{2}\/\d{2}\/\d{4}$/.test(key)&&typeof value==='string'));
 return {score:raw.score===undefined||raw.score===null?'':String(raw.score),entries};
}
function assetScore(item){
 const score=Number(item?.avaliacao?.score);
 return Number.isFinite(score)&&score>0?Math.min(10,Math.max(0,score)):0;
}
function idealPercentForAsset(item){
 const key=categoryKeyFromName(item?.tipo||item?.classe);
 if(!key)return 0;
 const target=(distributionItems||[]).find(x=>categoryKeyFromName(x.nome)===key);
 const categoryTarget=Number(target?.percentual||0);
 const assets=(state.itens||[]).filter(asset=>categoryKeyFromName(asset.tipo||asset.classe)===key);
 if(!assets.length)return categoryTarget;
 const totalScore=assets.reduce((sum,asset)=>sum+assetScore(asset),0);
 if(totalScore<=0)return categoryTarget/assets.length;
 return categoryTarget*assetScore(item)/totalScore;
}

function syncDashboardCategoryFilters(){
 const defs=[['acao','Ações'],['fii','FIIs'],['bdr','BDRs'],['etf','ETFs'],['internacional','ETFs Internacionais'],['renda_fixa','Renda Fixa'],['stocks','Stocks'],['reit','REITs'],['cripto','Criptomoedas'],['tesouro','Tesouro Direto'],['fundo','Fundos de Investimentos'],['outros','Outros']];
 // Usa somente classes que possuem ao menos um ativo efetivamente cadastrado na carteira.
 const activeTypes=new Set((state.itens||[])
  .filter(item=>String(item.ticker||item.nome||'').trim())
  .map(item=>categoryKeyFromName(item.tipo||item.classe)||String(item.tipo||item.classe||'').trim())
  .filter(Boolean));
 ['aporteType','allocationType','patrimonyType'].forEach(id=>{
  const select=document.getElementById(id);
  if(!select)return;
  const previous=select.value||'todos';
  const options=[['todos','Todos os tipos'],...defs.filter(([key])=>activeTypes.has(key))];
  select.innerHTML=options.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
  select.value=options.some(([value])=>value===previous)?previous:'todos';
 });
}
function enabledCategoryKeys(){
 return new Set((distributionItems||[]).map(x=>categoryKeyFromName(x.nome)).filter(Boolean));
}
function syncAssetTypeOptions(){
 const select=document.querySelector('#opForm select[name="tipo"]');
 if(!select)return;
 const allowed=enabledCategoryKeys();
 const defs=[['acao','Ações'],['fii','FIIs'],['stocks','Stocks'],['bdr','BDRs'],['etf','ETFs'],['internacional','ETFs Internacionais'],['reit','REITs'],['cripto','Criptomoedas'],['renda_fixa','Renda Fixa'],['tesouro','Tesouro Direto'],['fundo','Fundos de Investimentos'],['outros','Outros']];
 const current=select.value;
 select.innerHTML=defs.filter(([key])=>allowed.has(key)).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
 if(allowed.has(current))select.value=current;
 else if(select.options.length)select.selectedIndex=0;
}

function renderPositionInsights(rows){
 const enabled=enabledCategoryKeys();const variableTypes=new Set(['acao','fii','stocks','bdr','reit','etf','internacional','cripto']);rows=rows.filter(item=>enabled.has(item.tipo)&&variableTypes.has(item.tipo));
 const invested=rows.reduce((sum,item)=>sum+Number(item.investido||0),0),actual=rows.reduce((sum,item)=>sum+Number(item.valor_atual||0),0);
 const change=invested?((actual/invested)-1)*100:0;
 const returnPct=x=>x&&x.pluggy_retorno_pct!==null&&x.pluggy_retorno_pct!==undefined?Number(x.pluggy_retorno_pct):Number(x?.lucro_pct||0);
 const returnValue=x=>x&&x.pluggy_retorno_valor!==null&&x.pluggy_retorno_valor!==undefined?Number(x.pluggy_retorno_valor):Number(x?.lucro||0);
 const sorted=rows.filter(x=>Number.isFinite(returnPct(x))).slice().sort((a,b)=>returnPct(b)-returnPct(a));
 const best=sorted[0],worst=sorted[sorted.length-1];
 const winners=rows.filter(x=>Number(x.lucro_pct||0)>0).length;
 const losers=rows.filter(x=>Number(x.lucro_pct||0)<0).length;
 const total=rows.length,positivePct=total?(winners/total)*100:0;
 const opportunities=rows.filter(x=>Number(x.preco_atual)>0&&Number(x.preco_medio)>0&&Number(x.preco_atual)<Number(x.preco_medio));
 const recentAssets=[];
 const recentByAsset=new Map();
 (state.operacoes||[]).forEach(op=>{
  const ticker=String(op.ticker||'').trim().toUpperCase();
  const rawDate=String(op.data_execucao||op.data||'').trim();
  const date=rawDate.slice(0,10);
  if(!ticker||!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
  const key=`${ticker}|${String(op.tipo||'')}`;
  const previous=recentByAsset.get(key);
  if(!previous||date>previous.date)recentByAsset.set(key,{ticker,tipo:op.tipo||'',date});
 });
 recentAssets.push(...Array.from(recentByAsset.values()).sort((a,b)=>b.date.localeCompare(a.date)||a.ticker.localeCompare(b.ticker)).slice(0,3));
 const recentDateLabel=date=>{const [year,month,day]=date.split('-');return `${day}/${month}/${year}`;};
 document.getElementById('positionInsights').innerHTML=`
  <article class="insight-card insight-recent-card">
   <div class="insight-title">Últimos ativos lançados</div>
   <div class="insight-recent-list">
    ${recentAssets.length?recentAssets.map(asset=>`<div class="insight-recent-row"><div><b>${escapeHTML(asset.ticker)}</b><span>${escapeHTML(labels[asset.tipo]||asset.tipo||'Ativo')}</span></div><time>${recentDateLabel(asset.date)}</time></div>`).join(''):'<div class="insight-recent-empty">Nenhum lançamento registrado.</div>'}
   </div>
  </article>
  <article class="insight-card">
   <div class="insight-title">Destaques da carteira<span class="info-tip" tabindex="0" aria-label="Sobre os destaques da carteira" data-tip="Consideramos como destaque da carteira os ativos dos seguintes tipos: Ações, FIIs, Stocks, BDRs, REITs, ETFs e Criptomoedas.">i</span></div>
   <div class="insight-split">
    <div class="insight-highlight-column"><span class="insight-sub">Melhor posição</span><b>${best?escapeHTML(best.ticker):'—'}</b><span class="insight-highlight-pill positive" title="${best?`Rentabilidade desde a primeira compra (${best.pluggy_primeira_compra||'histórico disponível'}): ${brl(returnValue(best))}`:'Sem histórico suficiente'}">${best?pct(returnPct(best)):'—'} <span aria-hidden="true">${best&&returnPct(best)<0?'↘':'↗'}</span></span></div>
    <div class="insight-highlight-column"><span class="insight-sub">Pior posição</span><b>${worst?escapeHTML(worst.ticker):'—'}</b><span class="insight-highlight-pill negative" title="${worst?`Rentabilidade desde a primeira compra (${worst.pluggy_primeira_compra||'histórico disponível'}): ${brl(returnValue(worst))}`:'Sem histórico suficiente'}">${worst?pct(returnPct(worst)):'—'} <span aria-hidden="true">${worst&&returnPct(worst)>=0?'↗':'↘'}</span></span></div>
   </div>
  </article>
  <article class="insight-card">
   <div class="insight-title">Posições no lucro<span class="info-tip" tabindex="0" aria-label="Sobre posições no lucro" data-tip="Consideramos a rentabilidade para fornecer a informação dos ativos no lucro e no prejuízo.">i</span></div>
   <div class="insight-profit-summary"><div class="insight-main">${winners} de ${total}</div><small style="font-size:13px;color:var(--muted);font-weight:650">${total?Math.round(positivePct)+'%':'—'}</small></div>
   <div class="insight-bar"><span class="positive" style="width:${positivePct}%"></span><span class="negative" style="width:${total?losers/total*100:0}%"></span></div>
   <div class="insight-profit-counts insight-profit-links"><button type="button" class="green" onclick="openProfitPositionsModal('lucro')">${winners} no lucro ▲</button><button type="button" class="red" onclick="openProfitPositionsModal('prejuizo')">${losers} no prejuízo ▼</button></div>
  </article>
  <article class="insight-card">
   <div class="insight-title">Oportunidades de compra<span class="info-tip" tabindex="0" aria-label="Sobre oportunidades de compra" data-tip="Ativos marcados como “comprar” e com o valor atual abaixo do preço médio.">i</span></div>
   <div class="insight-main">${opportunities.length} ativos</div>
   <div class="insight-sub">Preço atual abaixo do preço médio de aquisição</div>
   <button class="insight-action insight-action-animated" type="button" onclick="openOpportunityModal()">Ver ativos →</button>
  </article>`;
}
function toggleAssetGroup(type){
 const isExpanded=expandedAssetGroups[type]!==undefined
  ? expandedAssetGroups[type]
  : (state.itens||[]).some(item=>item.tipo===type);
 expandedAssetGroups[type]=!isExpanded;
 renderPositionGroups(state.itens||[],'summaryGroups',true);
}
function toggleSummaryAssetGroup(type){
 summaryExpandedAssetGroups[type]=!summaryExpandedAssetGroups[type];
 renderPositionGroups(state.itens||[],'summaryGroups',true);
}
function getPositionCategoryOrder(){
 const defaults=['acao','fii','stocks','bdr','etf','internacional','reit','cripto','renda_fixa','tesouro','outros'];
 try{
  const saved=JSON.parse(localStorage.getItem('lonelyWalletPositionCategoryOrderV1')||'[]');
  if(Array.isArray(saved))return [...saved.filter(x=>defaults.includes(x)),...defaults.filter(x=>!saved.includes(x))];
 }catch(e){}
 return defaults;
}
function movePositionCategory(key,direction){
 const order=getPositionCategoryOrder();
 const visible=Array.from(document.querySelectorAll('#summaryGroups .asset-category[data-category-key]')).map(el=>el.dataset.categoryKey);
 const index=visible.indexOf(key),targetIndex=index+Number(direction);
 if(index<0||targetIndex<0||targetIndex>=visible.length)return;
 const other=visible[targetIndex],from=order.indexOf(key),to=order.indexOf(other);
 if(from<0||to<0)return;
 [order[from],order[to]]=[order[to],order[from]];
 try{localStorage.setItem('lonelyWalletPositionCategoryOrderV1',JSON.stringify(order));}catch(e){}
 renderPositionGroups(state.itens||[],'summaryGroups',true);
}
function moveSummaryCategory(key,direction){
 const order=getSummaryCategoryOrder();
 const visible=Array.from(document.querySelectorAll('#summaryGroups .asset-category[data-category-key]')).map(el=>el.dataset.categoryKey);
 const index=visible.indexOf(key),targetIndex=index+Number(direction);
 if(index<0||targetIndex<0||targetIndex>=visible.length)return;
 const other=visible[targetIndex],from=order.indexOf(key),to=order.indexOf(other);
 if(from<0||to<0)return;
 [order[from],order[to]]=[order[to],order[from]];
 try{localStorage.setItem('lonelyWalletSummaryCategoryOrderV1',JSON.stringify(order));}catch(e){}
 renderPositionGroups(state.itens||[],'summaryGroups',true);
}
function getSummaryCategoryOrder(){
 const defaults=['acao','fii','renda_fixa','etf','internacional','stocks','bdr','reit','cripto','tesouro','outros'];
 try{
  const saved=JSON.parse(localStorage.getItem('lonelyWalletSummaryCategoryOrderV1')||'[]');
  if(Array.isArray(saved))return [...saved.filter(x=>defaults.includes(x)),...defaults.filter(x=>!saved.includes(x))];
 }catch(e){}
 return defaults;
}
function startSummaryCategoryDrag(event,key){
 summaryDraggedCategory=key;
 event.dataTransfer.effectAllowed='move';
 event.dataTransfer.setData('text/plain',key);
 event.currentTarget.closest('.asset-category')?.classList.add('dragging');
}
function allowSummaryCategoryDrop(event){
 event.preventDefault();
 event.dataTransfer.dropEffect='move';
 const section=event.target.closest('.asset-category');
 if(section)section.classList.add('drag-over');
}
function clearSummaryDragStyles(){
 document.querySelectorAll('#summaryGroups .asset-category').forEach(el=>el.classList.remove('dragging','drag-over'));
}
function dropSummaryCategory(event,targetKey){
 event.preventDefault();
 const sourceKey=event.dataTransfer.getData('text/plain')||summaryDraggedCategory;
 clearSummaryDragStyles();
 if(!sourceKey||sourceKey===targetKey)return;
 const order=getSummaryCategoryOrder();
 const from=order.indexOf(sourceKey),to=order.indexOf(targetKey);
 if(from<0||to<0)return;
 order.splice(to,0,order.splice(from,1)[0]);
 try{localStorage.setItem('lonelyWalletSummaryCategoryOrderV1',JSON.stringify(order));}catch(e){}
 summaryDraggedCategory='';
 renderPositionGroups(state.itens||[],'summaryGroups',true);
}
function endSummaryCategoryDrag(){
 summaryDraggedCategory='';
 clearSummaryDragStyles();
}
let summaryPointerDrag=null;
function clearSummaryPointerDrag(){
 document.querySelectorAll('#summaryGroups .asset-category').forEach(el=>el.classList.remove('dragging','drag-over'));
}
function finishSummaryCategoryPointer(event){
 if(!summaryPointerDrag)return;
 const drag=summaryPointerDrag;
 const moved=drag.moved;
 let target=null;
 if(moved&&event&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)){
  target=document.elementFromPoint(event.clientX,event.clientY)?.closest('#summaryGroups .asset-category')||null;
 }
 document.removeEventListener('pointermove',moveSummaryCategoryPointer);
 document.removeEventListener('pointerup',finishSummaryCategoryPointer);
 document.removeEventListener('pointercancel',finishSummaryCategoryPointer);
 summaryPointerDrag=null;
 clearSummaryPointerDrag();
 const targetKey=target?.dataset.categoryKey;
 if(moved&&targetKey&&drag.key!==targetKey){
  const order=getSummaryCategoryOrder();
  const from=order.indexOf(drag.key),to=order.indexOf(targetKey);
  if(from>=0&&to>=0){
   const rect=target.getBoundingClientRect();
   const after=event.clientY>rect.top+rect.height/2;
   const [item]=order.splice(from,1);
   let insertAt=order.indexOf(targetKey);
   if(after)insertAt++;
   order.splice(insertAt,0,item);
   try{localStorage.setItem('lonelyWalletSummaryCategoryOrderV1',JSON.stringify(order));}catch(e){}
   renderPositionGroups(state.itens||[],'summaryGroups',true);
  }
 }
}
function moveSummaryCategoryPointer(event){
 if(!summaryPointerDrag||event.pointerId!==summaryPointerDrag.pointerId)return;
 const drag=summaryPointerDrag;
 const distance=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY);
 if(!drag.moved&&distance<5)return;
 drag.moved=true;
 event.preventDefault();
 clearSummaryPointerDrag();
 drag.source?.classList.add('dragging');
 const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('#summaryGroups .asset-category');
 if(target&&target!==drag.source)target.classList.add('drag-over');
}
function startSummaryCategoryPointer(event,key){
 if(event.button!==undefined&&event.button!==0)return;
 event.preventDefault();
 if(summaryPointerDrag)return;
 const source=event.currentTarget.closest('.asset-category');
 summaryPointerDrag={key,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false,source};
 document.addEventListener('pointermove',moveSummaryCategoryPointer,{passive:false});
 document.addEventListener('pointerup',finishSummaryCategoryPointer);
 document.addEventListener('pointercancel',finishSummaryCategoryPointer);
}
const positionSortState=Object.create(null);
function positionSortValue(item,key,totalPortfolio){
 const numeric={
  quantidade:'quantidade',preco_medio:'preco_medio',preco_atual:'preco_atual',
  variacao_dia:'variacao_dia',lucro_pct:'lucro_pct',valor_atual:'valor_atual',
  proventos:'proventos',nota:'nota',pl:'pl',pvp:'pvp',portfolioPct:null,
  idealPct:null,comprar:null
 };
 if(key==='ticker')return String(item.nome||item.ticker||'').trim();
 if(key==='portfolioPct')return totalPortfolio>0?Number(item.valor_atual||0)/totalPortfolio*100:0;
 if(key==='idealPct')return idealPercentForAsset(item);
 if(key==='comprar'){
  const share=totalPortfolio>0?Number(item.valor_atual||0)/totalPortfolio*100:0;
  return share<idealPercentForAsset(item)-0.005?1:0;
 }
 if(Object.prototype.hasOwnProperty.call(numeric,key)){
  const field=numeric[key]||key;
  return Number(item[field]||0);
 }
 return String(item[key]??'').toLocaleLowerCase('pt-BR');
}
function sortPositionAssets(category,key){
 const current=positionSortState[category]||{key:'valor_atual',direction:'desc'};
 const direction=current.key===key?(current.direction==='desc'?'asc':'desc'):(key==='ticker'?'asc':'desc');
 positionSortState[category]={key,direction};
 renderPositionGroups(state.itens||[],'summaryGroups',true);
 renderPositionGroups(state.itens||[],'summaryGroups',true);
}
function sortCategoryItems(items,category,totalPortfolio){
 if(!positionSortState[category])positionSortState[category]={key:'valor_atual',direction:'desc'};
 const {key,direction}=positionSortState[category];
 const multiplier=direction==='asc'?1:-1;
 return items.slice().sort((a,b)=>{
  const av=positionSortValue(a,key,totalPortfolio),bv=positionSortValue(b,key,totalPortfolio);
  if(typeof av==='string'||typeof bv==='string')return String(av).localeCompare(String(bv),'pt-BR',{numeric:true,sensitivity:'base'})*multiplier;
  return (Number(av)-Number(bv))*multiplier;
 });
}
const summaryCategoryPages={};
const SUMMARY_ASSETS_PAGE_SIZE=20;
function changeSummaryAssetsPage(category,page){summaryCategoryPages[category]=Math.max(1,Number(page)||1);renderPositionGroups(state.itens||[],'summaryGroups',true);}
function summaryCategoryPagination(category,totalPages,currentPage){
 if(totalPages<=1)return '';
 const buttons=[...new Set([1,currentPage-1,currentPage,currentPage+1,totalPages].filter(n=>n>=1&&n<=totalPages))].sort((a,b)=>a-b);
 let previous=0;
 const pageButtons=buttons.map(n=>{const gap=previous&&n-previous>1?'<span>…</span>':'';previous=n;return gap+`<button type="button" class="${n===currentPage?'active':''}" ${n===currentPage?'aria-current="page"':''} onclick="changeSummaryAssetsPage('${category}',${n})">${n}</button>`;}).join('');
 return `<nav class="summary-assets-pagination" role="navigation" aria-label="Paginação de ${escapeHTML(labels[category]||category)}"><button type="button" ${currentPage===1?'disabled':''} onclick="changeSummaryAssetsPage('${category}',${currentPage-1})">Anterior</button>${pageButtons}<button type="button" ${currentPage===totalPages?'disabled':''} onclick="changeSummaryAssetsPage('${category}',${currentPage+1})">Próximo</button><span>Página ${currentPage} de ${totalPages}</span></nav>`;
}
function renderPositionGroups(rows,hostId='summaryGroups',summaryMode=true){
 const categories=[
  {key:'acao',name:'Ações',icon:'▣'},{key:'fii',name:'FIIs',icon:'▥'},{key:'stocks',name:'Stocks',icon:'◎'},
  {key:'bdr',name:'BDRs',icon:'▧'},{key:'etf',name:'ETFs',icon:'◉'},{key:'internacional',name:'ETFs Internacionais',icon:'◎'},
  {key:'reit',name:'REITs',icon:'▥'},{key:'cripto',name:'Criptomoedas',icon:'₿'},{key:'renda_fixa',name:'Renda Fixa',icon:'▤'},
  {key:'tesouro',name:'Tesouro Direto',icon:'▤'},{key:'fundo',name:'Fundos de Investimentos',icon:'▤'},{key:'outros',name:'Outros',icon:'▧'}
 ];
 const enabled=enabledCategoryKeys(),visibleCategories=categories.filter(cat=>enabled.has(cat.key));
 if(summaryMode){
  const order=getSummaryCategoryOrder();
  visibleCategories.sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));
 }else{
  const order=getPositionCategoryOrder();
  visibleCategories.sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));
 }
 const host=document.getElementById(hostId);
 if(!host)return;
 if(!visibleCategories.length){host.innerHTML='<div class="empty">Configure e salve as classes na tela Distribuição para exibir suas categorias aqui.</div>';return;}
 const totalPortfolio=rows.reduce((sum,item)=>sum+Number(item.valor_atual||0),0),prefs=getPositionColumnPrefs();
 const defs=[
  ['ticker','Ativo',i=>{
   const routes={acao:'acoes',fii:'fiis',stocks:'stocks',bdr:'bdrs',etf:'etfs',internacional:'etfs-internacionais',reit:'reits',cripto:'criptomoedas'};
   const route=routes[i.tipo],ticker=String(i.ticker||'').toLowerCase();
   const isFixedIncome=i.tipo==='renda_fixa';
   const logoUrl=i.logo||`https://icons.brapi.dev/icons/${encodeURIComponent(i.ticker||'')}.svg`;
   const initials=escapeHTML(String(i.ticker||'').slice(0,2).toUpperCase());
   const fixedLogo=`<span class="asset-fixed-logo" aria-hidden="true"><svg viewBox="0 0 32 32" width="25" height="25" fill="none"><rect x="3.5" y="3.5" width="25" height="25" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M9 22V17M14 22V11M19 22V14M24 22V8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 24.5H25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>`;
   const logo=isFixedIncome?fixedLogo:`<span class="asset-logo-wrap"><img class="asset-logo" src="${escapeHTML(logoUrl)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="asset-logo-fallback" hidden>${initials}</span></span>`;
   const name=isFixedIncome?escapeHTML(i.nome||i.ticker):(route?`<a class="asset-market-link" href="https://investidor10.com.br/${route}/${encodeURIComponent(ticker)}/" target="_blank" rel="noopener noreferrer" title="Abrir ${escapeHTML(i.ticker)} no Investidor10">${escapeHTML(i.ticker)}</a>`:escapeHTML(i.ticker));
   return `<td data-col="ticker" class="ticker"><span class="asset-name-cell">${logo}<span class="asset-name-text">${name}</span></span></td>`;
  }],
  ['quantidade','Quant.',i=>`<td data-col="quantidade">${Number(i.quantidade).toLocaleString('pt-BR',{maximumFractionDigits:4})}</td>`],
  ['preco_medio','Preço Médio',i=>`<td data-col="preco_medio">${brl(i.preco_medio)}</td>`],
  ['preco_atual','Preço Atual',i=>`<td data-col="preco_atual">${i.cotacao_disponivel?brl(i.preco_atual):(i.tipo==='renda_fixa'?(i.aviso_calculo==='Indexador ou taxa não informado'?'Informe o indexador':'Cálculo indisponível'):'Sem cotação')}${i.cotacao_origem==='Posição importada'?'<div class="mini">Referência 31/10/2026</div>':''}${i.tipo==='renda_fixa'&&i.cotacao_disponivel?'<div class="mini">Calculado pelo indexador</div>':''}</td>`],
  ['preco_alvo','Meu Preço-Alvo',i=>`<td data-col="preco_alvo">—</td>`],
  ['preco_graham','Preço Justo (Graham)',i=>`<td data-col="preco_graham">—</td>`],
  ['preco_teto_bazin','Preço-teto (Bazin)',i=>`<td data-col="preco_teto_bazin">${i.preco_teto_bazin?brl(i.preco_teto_bazin):'—'}</td>`],
  ['variacao_dia','Variação',i=>`<td data-col="variacao_dia">${i.variacao_dia==null?'<span class="muted">—</span>':`<span class="variation-pill ${Number(i.variacao_dia)>=0?'positive':'negative'} value-hint variation-money-trigger" data-hint="${escapeHTML(variationMoneyHint(i,i.variacao_dia))}" aria-label="${escapeHTML(variationMoneyHint(i,i.variacao_dia).replace(/\n/g,' '))}" onmouseenter="showVariationMoneyTooltip(event,this)" onmousemove="moveVariationMoneyTooltip(event,this)" onmouseleave="hideVariationMoneyTooltip()" onfocus="showVariationMoneyTooltip(event,this)" onblur="hideVariationMoneyTooltip()" tabindex="0">${Number(i.variacao_dia)>=0?'▲':'▼'} ${pct(i.variacao_dia)}</span>`}</td>`],
  ['lucro_pct','Rentabilidade',i=>`<td data-col="lucro_pct"><span class="variation-pill ${Number(i.lucro_pct)>=0?'positive':'negative'}">${Number(i.lucro_pct)>=0?'↗':'↘'} ${pct(i.lucro_pct)}</span></td>`],
  ['valor_atual','Saldo',i=>`<td data-col="valor_atual">${brl(i.valor_atual)}</td>`],
  ['buyhold','Pontuação Buy and Hold',i=>`<td data-col="buyhold">—</td>`],
  ['media_avaliacoes','Média de Avaliações',i=>`<td data-col="media_avaliacoes">—</td>`],
  ['proventos','Proventos Recebidos',i=>`<td data-col="proventos">${brl(i.proventos)}</td>`],
  ['dy','DY',i=>`<td data-col="dy">—</td>`],['yoc','Yield On Cost (YOC)',i=>`<td data-col="yoc">—</td>`],['dy_medio','DY Médio (5 anos)',i=>`<td data-col="dy_medio">—</td>`],
  ['payout','Payout',i=>`<td data-col="payout">—</td>`],['pl','P/L',i=>`<td data-col="pl">${i.pl==null?'—':Number(i.pl).toLocaleString('pt-BR',{maximumFractionDigits:2})}</td>`],
  ['pvp','P/VP',i=>`<td data-col="pvp">${i.pvp==null?'—':Number(i.pvp).toLocaleString('pt-BR',{maximumFractionDigits:2})}</td>`],
  ['roe','ROE',i=>`<td data-col="roe">—</td>`],['margem_liquida','Margem Líquida',i=>`<td data-col="margem_liquida">—</td>`],
  ['margem_bruta','Margem Bruta',i=>`<td data-col="margem_bruta">—</td>`],['cagr_receitas','CAGR Receitas (5 anos)',i=>`<td data-col="cagr_receitas">—</td>`],['cagr_lucros','CAGR Lucros (5 anos)',i=>`<td data-col="cagr_lucros">—</td>`],
  ['portfolioPct','% Carteira',i=>{const share=totalPortfolio?Number(i.valor_atual||0)/totalPortfolio*100:0;return `<td data-col="portfolioPct">${share.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%</td>`;}],
  ['idealPct','% Ideal',i=>{const ideal=idealPercentForAsset(i),share=totalPortfolio?Number(i.valor_atual||0)/totalPortfolio*100:0;const hint=idealBalanceHint(i.valor_atual,share,ideal,totalPortfolio);const action=share>ideal+0.005?'sell':share<ideal-0.005?'buy':'neutral';return `<td data-col="idealPct"><span class="ideal-balance-hint" data-action="${action}" tabindex="0" role="note" aria-label="${escapeHTML(hint)}" data-hint="${escapeHTML(hint)}" onmouseenter="showIdealBalanceTooltip(event,this)" onmousemove="moveIdealBalanceTooltip(event,this)" onmouseleave="hideIdealBalanceTooltip()" onfocus="showIdealBalanceTooltip(event,this)" onblur="hideIdealBalanceTooltip()">${ideal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%</span></td>`;}],
  ['comprar','Comprar?',i=>{const ideal=idealPercentForAsset(i),share=totalPortfolio?Number(i.valor_atual||0)/totalPortfolio*100:0;const needsContribution=share<ideal-0.005;return `<td data-col="comprar">${needsContribution?'<span class="buy-yes">✓ Sim</span>':'<span class="buy-no">⊗ Não</span>'}</td>`;}]
 ];
 host.innerHTML=visibleCategories.map((cat,categoryIndex)=>{
  const categoryRows=rows.filter(item=>item.tipo===cat.key),total=categoryRows.reduce((sum,item)=>sum+Number(item.valor_atual||0),0),allCategoryItems=sortCategoryItems(categoryRows,cat.key,totalPortfolio),categoryPages=Math.max(1,Math.ceil(allCategoryItems.length/SUMMARY_ASSETS_PAGE_SIZE)),categoryPage=summaryMode?Math.min(Math.max(1,Number(summaryCategoryPages[cat.key]||1)),categoryPages):1,items=summaryMode?allCategoryItems.slice((categoryPage-1)*SUMMARY_ASSETS_PAGE_SIZE,categoryPage*SUMMARY_ASSETS_PAGE_SIZE):allCategoryItems,invested=allCategoryItems.reduce((sum,item)=>sum+Number(item.investido||0),0);
  if(summaryMode)summaryCategoryPages[cat.key]=categoryPage;
  const variation=allCategoryItems.length?allCategoryItems.reduce((sum,item)=>sum+Number(item.pluggy_variacao_pct??item.variacao_dia??0),0)/allCategoryItems.length:0;
  // Rentabilidade da classe é ponderada pelo capital de cada ativo. A média
  // simples das porcentagens dava o mesmo peso a posições pequenas e grandes.
  // Quando Pluggy fornece retorno e capital histórico, usa esse par; nos demais
  // casos usa ganho de preço + proventos sobre o valor efetivamente investido.
  const categoryReturn=allCategoryItems.reduce((acc,item)=>{
   const hasPluggy=Number.isFinite(Number(item.pluggy_retorno_valor))&&Number.isFinite(Number(item.pluggy_investido_historico))&&Number(item.pluggy_investido_historico)>0;
   const base=hasPluggy?Number(item.pluggy_investido_historico):Number(item.investido||0);
   const result=hasPluggy?Number(item.pluggy_retorno_valor):Number(item.lucro||0)+Number(item.proventos||0);
   if(base>0){acc.base+=base;acc.result+=result;}
   return acc;
  },{base:0,result:0});
  const profitability=categoryReturn.base>0?categoryReturn.result/categoryReturn.base*100:0;
  const target=distributionItems.find(x=>categoryKeyFromName(x.nome)===cat.key),ideal=Number(target?.percentual||0),portfolioPct=totalPortfolio?total/totalPortfolio*100:0;
  const expanded=summaryMode
   ? summaryExpandedAssetGroups[cat.key]===true
   : (expandedAssetGroups[cat.key]!==undefined?expandedAssetGroups[cat.key]:items.length>0);
  const fixedIncomeSummaryColumns=['ticker','lucro_pct','valor_atual','nota','portfolioPct','idealPct','comprar'];
  const shown=summaryMode&&cat.key==='renda_fixa'?defs.filter(([key])=>fixedIncomeSummaryColumns.includes(key)):defs.filter(([key])=>prefs[key] && !(cat.key==='renda_fixa' && ['proventos','variacao_dia'].includes(key)));
  const columnWeights={ticker:2.25,quantidade:.72,preco_medio:1.05,preco_atual:1.05,preco_alvo:1.05,preco_graham:1.1,preco_teto_bazin:1.05,variacao_dia:.85,lucro_pct:1.0,valor_atual:1.05,buyhold:1.0,media_avaliacoes:1.0,proventos:1.0,dy:.75,yoc:.9,dy_medio:.95,payout:.8,pl:.7,pvp:.7,roe:.8,margem_liquida:1.0,margem_bruta:1.0,cagr_receitas:1.1,cagr_lucros:1.05,nota:.62,portfolioPct:.72,idealPct:.72,comprar:.82,opcoes:.52};
  const widthKeys=[...shown.map(([key])=>key),'opcoes'];
  const widthTotal=widthKeys.reduce((sum,key)=>sum+(columnWeights[key]||.9),0);
  const proportionalCols=`<colgroup>${widthKeys.map(key=>`<col style="width:${((columnWeights[key]||.9)/widthTotal*100).toFixed(3)}%">`).join('')}</colgroup>`;
  const body=items.length?`<div class="tablewrap"><table class="data proportional-assets-table" data-position-table ${summaryMode&&cat.key==='renda_fixa'?'data-fixed-income-summary="true"':''}>${proportionalCols}<thead><tr>${shown.map(([key,label])=>{const sort=positionSortState[cat.key]||{key:'valor_atual',direction:'desc'};const active=sort.key===key;const arrow=active?(sort.direction==='desc'?'▼':'▲'):'';return `<th data-col="${key}" class="position-sort-th"><button type="button" class="position-sort-button ${active?'is-sorted':''}" onclick="sortPositionAssets('${cat.key}','${key}')" title="Ordenar por ${escapeHTML(label)}">${label}<span class="position-sort-indicator" aria-hidden="true">${arrow}</span></button></th>`;}).join('')}<th data-col="opcoes">Opções</th></tr></thead><tbody>${items.map(i=>`<tr>${shown.map(([,label,renderCell])=>renderCell(i)).join('')}<td data-col="opcoes" class="asset-options-cell"><button type="button" class="asset-options-trigger" aria-label="Opções de ${escapeHTML(i.ticker)}" onclick="openAssetMenu(event,'${escapeHTML(i.ticker)}')">•••</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">${summaryMode&&allCategoryItems.length?"Os ativos desta classe estão em outra página.":"Nenhum ativo cadastrado nesta categoria."}</div>`;
  const categoryMetrics=`<span class="asset-category-title"><span class="asset-category-icon">${cat.icon}</span>${cat.name}</span><span class="asset-category-metric">Ativos<b>${allCategoryItems.length}</b></span><span class="asset-category-metric">Valor total<b>${brl(total)}</b></span>${cat.key==='renda_fixa'?'<span class="asset-category-metric category-metric-placeholder" aria-hidden="true"><span>Variação</span><b>—</b></span>':`<span class="asset-category-metric">Variação<b class="${allCategoryItems.length?'metric-change '+(variation>=0?'green':'red'):'category-empty-value'}">${allCategoryItems.length?`${variation>=0?'▲':'▼'} ${pct(variation)}`:'-'}</b></span>`}<span class="asset-category-metric">Rentabilidade<b>${allCategoryItems.length?`<span class="variation-pill ${profitability>=0?'positive':'negative'}">${profitability>=0?'↗':'↘'} ${pct(profitability)}</span>`:'<span class="category-empty-pill">-</span>'}</b></span><span class="asset-category-metric">% na carteira<b>${Math.round(portfolioPct)}% / ${Math.round(ideal)}%</b></span><span class="asset-category-chevron">⌄</span>`;
  const moveControls=`<div class="position-category-move">${categoryIndex>0?`<button type="button" class="position-category-arrow" title="Mover ${cat.name} para cima" aria-label="Mover ${cat.name} para cima" onclick="event.stopPropagation();${summaryMode?'moveSummaryCategory':'movePositionCategory'}('${cat.key}',-1)">↑</button>`:''}${categoryIndex<visibleCategories.length-1?`<button type="button" class="position-category-arrow" title="Mover ${cat.name} para baixo" aria-label="Mover ${cat.name} para baixo" onclick="event.stopPropagation();${summaryMode?'moveSummaryCategory':'movePositionCategory'}('${cat.key}',1)">↓</button>`:''}</div>`;
  const header=summaryMode
   ? `<div class="summary-category-head">${moveControls}<button type="button" class="asset-category-head summary-category-toggle" onclick="toggleSummaryAssetGroup('${cat.key}')" aria-expanded="${expanded}">${categoryMetrics}</button></div>`
   : `<div class="position-category-head">${moveControls}<button type="button" class="asset-category-head position-group-toggle" onclick="toggleAssetGroup('${cat.key}')" aria-expanded="${expanded}">${categoryMetrics}</button></div>`;
  return `<section class="asset-category ${expanded?'':'collapsed'} ${summaryMode?'summary-draggable-category':''}" ${summaryMode?`data-category-key="${cat.key}"`:!summaryMode?`data-category-key="${cat.key}"`:``}>${header}<div class="asset-category-body">${body}${summaryMode?summaryCategoryPagination(cat.key,categoryPages,categoryPage):''}</div></section>`;
 }).join('');
 applyPositionColumnPrefs();
 requestAnimationFrame(()=>alignCategoryMoveControls(hostId));
}

// Os controles ficam em uma coluna própria no cabeçalho, imediatamente antes
// do nome/ícone da classe. Assim não sobrepõem a tabela ao expandir a categoria.
function alignCategoryMoveControls(hostId){
 const host=document.getElementById(hostId);
 if(!host)return;
 host.querySelectorAll('.position-category-move').forEach(el=>{
  el.style.left='';el.style.top='';
 });
}
window.addEventListener('resize',()=>requestAnimationFrame(()=>alignCategoryMoveControls('summaryGroups')));

function idealBalanceHint(assetValue,share,ideal,totalPortfolio){
 const value=Math.max(0,Number(assetValue||0));
 const total=Math.max(0,Number(totalPortfolio||0));
 const target=Math.max(0,Math.min(99.99,Number(ideal||0)))/100;
 if(total<=0||Math.abs(Number(share||0)-Number(ideal||0))<0.005)
  return 'Sua posição já está no percentual ideal.';
 if(Number(share||0)>Number(ideal||0)){
  const amount=(value-target*total)/(1-target);
  return `Quanto preciso vender para atingir o balanceamento ideal?\n${brl(Math.max(0,amount))}`;
 }
 const amount=(target*total-value)/(1-target);
 return `Quanto preciso aportar para atingir o balanceamento ideal?\n${brl(Math.max(0,amount))}`;
}

function hideIdealBalanceTooltip(){
 const tip=document.getElementById('idealBalanceFloatingTooltip');
 if(tip)tip.remove();
}
function showIdealBalanceTooltip(event,el){
 const text=el?.dataset?.hint||'';
 if(!text)return;
 let tip=document.getElementById('idealBalanceFloatingTooltip');
 if(!tip){
  tip=document.createElement('div');
  tip.id='idealBalanceFloatingTooltip';
  document.body.appendChild(tip);
 }
 const action=el?.dataset?.action||'neutral';
 tip.className='variation-money-floating-tooltip '+(action==='sell'?'is-negative':action==='buy'?'is-positive':'is-neutral');
 tip.textContent=text;
 tip.style.visibility='hidden';
 tip.style.display='block';
 const rect=el.getBoundingClientRect();
 const width=Math.min(330,window.innerWidth-24);
 tip.style.width=width+'px';
 tip.style.left='0px';
 tip.style.top='0px';
 tip.style.visibility='visible';
 const box=tip.getBoundingClientRect();
 let left=rect.left+rect.width/2-box.width/2;
 left=Math.max(12,Math.min(left,window.innerWidth-box.width-12));
 let top=rect.top-box.height-10;
 if(top<10)top=rect.bottom+10;
 top=Math.max(10,Math.min(top,window.innerHeight-box.height-10));
 tip.style.left=left+'px';
 tip.style.top=top+'px';
}
function moveIdealBalanceTooltip(event,el){
 const tip=document.getElementById('idealBalanceFloatingTooltip');
 if(tip && document.activeElement!==el)showIdealBalanceTooltip(event,el);
}

function variationMoneyHint(item,change){
 const amount=item&&item.pluggy_variacao_valor!==null&&item.pluggy_variacao_valor!==undefined?Number(item.pluggy_variacao_valor):Number(item.variacao_valor??item.lucro??(Number(item.quantidade||0)*Number(item.preco_atual||0)*Number(change||0)/100));
 return `Quanto uma variação de ${pct(change)} representa?\n${brl(amount)}`;
}
 
window.hideVariationMoneyTooltip=function hideVariationMoneyTooltip(){
 const tip=document.getElementById('variationMoneyFloatingTooltip');
 if(tip)tip.remove();
}
window.showVariationMoneyTooltip=function showVariationMoneyTooltip(event,el){
 const text=el?.dataset?.hint||'';
 if(!text)return;
 let tip=document.getElementById('variationMoneyFloatingTooltip');
 if(!tip){tip=document.createElement('div');tip.id='variationMoneyFloatingTooltip';document.body.appendChild(tip);}
 tip.className='variation-money-floating-tooltip '+(el.classList.contains('positive')?'is-positive':'is-negative');
 tip.textContent=text;
 tip.style.visibility='hidden';tip.style.display='block';
 const rect=el.getBoundingClientRect(),width=Math.min(340,window.innerWidth-24);
 tip.style.width=width+'px';tip.style.left='0px';tip.style.top='0px';tip.style.visibility='visible';
 const box=tip.getBoundingClientRect();
 let left=rect.left+rect.width/2-box.width/2;
 left=Math.max(12,Math.min(left,window.innerWidth-box.width-12));
 let top=rect.top-box.height-10;
 if(top<10)top=rect.bottom+10;
 top=Math.max(10,Math.min(top,window.innerHeight-box.height-10));
 tip.style.left=left+'px';tip.style.top=top+'px';
}
window.moveVariationMoneyTooltip=function moveVariationMoneyTooltip(event,el){
 const tip=document.getElementById('variationMoneyFloatingTooltip');
 if(tip && document.activeElement!==el)showVariationMoneyTooltip(event,el);
}

function closeAssetMenu(){
 const menu=document.getElementById('assetActionMenu');
 if(menu)menu.remove();
}
function openAssetMenu(event,ticker){
 event.stopPropagation();
 const currentMenu=document.getElementById('assetActionMenu');
 if(currentMenu&&currentMenu.__anchor===event.currentTarget){
  closeAssetMenu();
  return;
 }
 closeAssetMenu();
 const menu=document.createElement('div');
 menu.__anchor=event.currentTarget;
 menu.dataset.ticker=String(ticker||'').toUpperCase();
 menu.id='assetActionMenu';menu.className='asset-action-menu';
 menu.innerHTML=`
  <button type="button" onclick="assetMenuAction('add','${escapeHTML(ticker)}')"><span>＋</span>Adicionar Lançamento</button>
  <button type="button" onclick="assetMenuAction('transactions','${escapeHTML(ticker)}')"><span>☷</span>Ver lançamentos</button>
  <button type="button" onclick="assetMenuAction('notes','${escapeHTML(ticker)}')"><span>▱</span>Minhas observações</button>
  <button type="button" onclick="assetMenuAction('columns','${escapeHTML(ticker)}')"><span>▤</span>Editar colunas</button>
  <div class="asset-menu-divider"></div>
  <button type="button" class="danger" onclick="assetMenuAction('delete','${escapeHTML(ticker)}')"><span>♜</span>Excluir</button>`;
 document.body.appendChild(menu);
 const rect=event.currentTarget.getBoundingClientRect();
 const width=228, height=menu.offsetHeight;
 let left=Math.min(window.innerWidth-width-10,Math.max(10,rect.right-width));
 let top=rect.bottom+5;
 if(top+height>window.innerHeight-10)top=Math.max(10,rect.top-height-5);
 menu.style.left=left+'px';menu.style.top=top+'px';
}
async function investor10Url(ticker,type){
 const paths={acao:'acoes',fii:'fiis',bdr:'bdrs',etf:'etfs',internacional:'etfs',stocks:'stocks',reit:'reits',cripto:'criptomoedas'};
 const path=paths[type]||'acoes';
 return `https://investidor10.com.br/${path}/${encodeURIComponent(ticker.toLowerCase())}/`;
}
async function assetMenuAction(action,ticker){
 closeAssetMenu();
 if(action==='add'){
  const item=(state.itens||[]).find(x=>String(x.ticker||'').toUpperCase()===String(ticker||'').toUpperCase());
  if(!item){toast('Não foi possível localizar o ativo na carteira.');return;}
  openModal('op');
  await setOperationSide('compra');
  syncAssetTypeOptions();
  if(![...assetType.options].some(option=>option.value===item.tipo)){
   const option=document.createElement('option');
   option.value=item.tipo;option.textContent=item.tipo==='renda_fixa'?'Renda Fixa':item.tipo==='tesouro'?'Tesouro Direto':item.tipo;
   assetType.add(option);
  }
  assetType.value=item.tipo;
  renderSpecificFields(item.tipo);
  assetInput.value=item.ticker;
  selectedAsset=item;
  quantityInput.value='1';
  costsInput.value='0,00';
  assetPrice.value='';
  updateOperationTotal();

  if(['renda_fixa','tesouro'].includes(item.tipo)){
   try{
    const operations=await api('/api/operacoes');
    const previous=(operations.itens||[])
     .filter(op=>String(op.ticker||'').toUpperCase()===String(ticker).toUpperCase()&&op.lado==='compra'&&op.status!=='agendada')
     .sort((a,b)=>String(b.data_execucao||b.data).localeCompare(String(a.data_execucao||a.data))||Number(b.id)-Number(a.id))[0];
    let details={};
    if(previous?.detalhes){
     try{details=typeof previous.detalhes==='string'?JSON.parse(previous.detalhes):previous.detalhes||{};}catch(e){details={};}
    }
    Object.entries(details).forEach(([key,value])=>{
     const field=document.querySelector(`#opForm [name="detail_${CSS.escape(key)}"]`);
     if(field&&value!==null&&value!==undefined)field.value=String(value);
    });
    assetHint.textContent=previous
     ? 'Dados do último lançamento carregados. Informe o valor aplicado.'
     : 'Ativo selecionado. Preencha o valor aplicado e os dados do investimento.';
   }catch(error){
    assetHint.textContent='Ativo selecionado. Informe o valor aplicado.';
   }
   assetPrice.focus();
   return;
  }

  assetHint.textContent='Ativo selecionado. Informe a quantidade; a cotação será preenchida automaticamente.';
  if(Number(item.preco_atual)>0)moneyInput(item.preco_atual);
  fillAssetQuote(item.ticker);
  quantityInput.focus();
  return;
 }
 if(action==='transactions'){openAssetTransactions(ticker);return;}
 if(action==='notes'){openAssetNotes(ticker);return;}
 if(action==='columns'){openColumnsModal();return;}
 if(action==='fundamentals'){
  const item=(state.itens||[]).find(x=>String(x.ticker).toUpperCase()===ticker.toUpperCase());
  window.open(investor10Url(ticker,item?.tipo),'_blank','noopener,noreferrer');
  return;
 }
 if(action==='delete'){
  if(!await appConfirm('Excluir ativo da carteira','Excluir '+ticker+' e todos os seus lançamentos? Esta ação não pode ser desfeita.','Excluir ativo'))return;
  try{
   const data=await api('/api/operacoes');
   const related=(data.itens||[]).filter(x=>String(x.ticker).toUpperCase()===ticker.toUpperCase());
   for(const op of related)await api('/api/operacoes/'+op.id,{method:'DELETE'});
   await refresh();toast(ticker+' foi excluído da carteira.');
  }catch(e){toast(e.message)}
 }
}

const POSITION_COLUMNS=[
 {group:'Dados básicos',items:[
  ['ticker','Ativo',true,true],['quantidade','Quantidade',true,true],['preco_medio','Preço Médio',true],
  ['preco_atual','Preço Atual',true],['preco_alvo','Meu Preço-Alvo',false],['preco_graham','Preço Justo (Graham)',false],
  ['preco_teto_bazin','Preço-teto (Bazin)',false],['variacao_dia','Variação',true],['lucro_pct','Rentabilidade',true],
  ['valor_atual','Saldo',true],['buyhold','Pontuação Buy and Hold',false],['media_avaliacoes','Média de Avaliações',false]
 ]},
 {group:'Dividendos',items:[
  ['proventos','Proventos Recebidos',true],['dy','DY',false],['yoc','Yield On Cost (YOC)',false],['dy_medio','DY Médio (5 anos)',false]
 ]},
 {group:'Dados Fundamentalistas',items:[
  ['payout','Payout',false],['pl','P/L',false],['pvp','P/VP',false],['roe','ROE',false],
  ['margem_liquida','Margem Líquida',false],['margem_bruta','Margem Bruta',false],
  ['cagr_receitas','CAGR Receitas (5 anos)',false],['cagr_lucros','CAGR Lucros (5 anos)',false]
 ]},
 {group:'Rebalanceamento de carteira',items:[
  ['portfolioPct','% na Carteira',true],['idealPct','% Ideal',true],['comprar','Comprar',true]
 ]}
];
function getPositionColumnPrefs(){
 let saved={};try{saved=JSON.parse(localStorage.getItem('lonelyWalletPositionColumnsV2')||'{}')}catch(e){}
 const prefs={};
 POSITION_COLUMNS.forEach(g=>g.items.forEach(([key,label,def,locked])=>prefs[key]=locked?true:(saved[key]===undefined?!!def:!!saved[key])));
 return prefs;
}
function openColumnsModal(){
 const prefs=getPositionColumnPrefs();
 const groups=POSITION_COLUMNS.map(group=>`<section class="column-group"><h3>${group.group}</h3><div class="column-options">${group.items.map(([key,label,def,locked])=>`<label class="column-option ${locked?'locked':''}"><input type="checkbox" data-column="${key}" ${prefs[key]?'checked':''} ${locked?'disabled':''}><span>${label}</span></label>`).join('')}</div></section>`).join('');
 document.getElementById('columnsModalContent').innerHTML=groups;
 document.getElementById('columnsModalBack').style.display='flex';
}
function savePositionColumns(){
 const prefs=getPositionColumnPrefs();
 document.querySelectorAll('#columnsModalContent input[data-column]').forEach(input=>prefs[input.dataset.column]=input.checked);
 try{localStorage.setItem('lonelyWalletPositionColumnsV2',JSON.stringify(prefs))}catch(e){}
 closeUtilityModal('columnsModalBack');renderPositionGroups(state.itens||[],'summaryGroups',true);renderPositionGroups(state.itens||[],'summaryGroups',true);toast('Colunas atualizadas.');
}
function restorePositionColumns(){
 try{localStorage.removeItem('lonelyWalletPositionColumnsV2')}catch(e){}
 openColumnsModal();toast('Configuração padrão restaurada.');
}
function applyPositionColumnPrefs(){
 const prefs=getPositionColumnPrefs();
 document.querySelectorAll('#summaryGroups table[data-position-table]').forEach(table=>{
  table.querySelectorAll('[data-col]').forEach(cell=>{
   // A coluna Opções é fixa: não faz parte das preferências de colunas e nunca deve sumir.
   const alwaysVisible=cell.dataset.col==='opcoes';
   const fixedIncomeSummary=table.dataset.fixedIncomeSummary==='true';
   cell.style.display=(alwaysVisible||fixedIncomeSummary||!!prefs[cell.dataset.col])?'':'none';
  });
 });
}
function closeUtilityModal(id){const el=document.getElementById(id);if(el)el.style.display='none';}
function noteStorageKey(ticker){return 'lonelyWalletNotesV2:'+ticker.toUpperCase();}
function openAssetNotes(ticker){
 const data=readAssetNoteData(ticker),today=new Date().toLocaleDateString('pt-BR');
 document.getElementById('notesModalTitle').textContent='Observações ('+ticker+')';
 document.getElementById('notesModalContent').innerHTML=`<div class="note-entry"><p class="mini">A avaliação do ativo é calculada automaticamente com os fundamentos disponíveis nas APIs conectadas. Este espaço é apenas para suas observações.</p><strong>${today}</strong><textarea id="assetNoteText" rows="5" placeholder="Escreva suas observações sobre ${escapeHTML(ticker)}...">${escapeHTML(data.entries[today]||'')}</textarea><div class="note-actions"><button class="primary" type="button" onclick="saveAssetNote('${escapeHTML(ticker)}')">Salvar observações</button></div></div>`;
 document.getElementById('notesModalBack').style.display='flex';
}
function saveAssetNote(ticker){
 const key=noteStorageKey(ticker),data=readAssetNoteData(ticker),today=new Date().toLocaleDateString('pt-BR');
 const value=document.getElementById('assetNoteText').value.trim();
 if(value)data.entries[today]=value;else delete data.entries[today];
 try{localStorage.setItem(key,JSON.stringify(data));}catch(e){toast('Não foi possível salvar a nota.');return;}
 closeUtilityModal('notesModalBack');renderPositionGroups(state.itens||[],'summaryGroups',true);renderPositionGroups(state.itens||[],'positionGroups',false);toast('Observações salvas.');
}
let assetTransactionsPage=1,assetTransactionsTicker='';
async function openAssetTransactions(ticker,page=1){
 assetTransactionsTicker=ticker;assetTransactionsPage=page;
 const back=document.getElementById('transactionsModalBack');
 document.getElementById('transactionsModalTitle').textContent='Lançamentos do Ativo '+ticker;
 document.getElementById('transactionsModalContent').innerHTML='<div class="empty">Carregando lançamentos...</div>';
 back.style.display='flex';
 try{
  const data=await api('/api/operacoes');
  const rows=(data.itens||[]).filter(x=>String(x.ticker).toUpperCase()===ticker.toUpperCase()).sort((a,b)=>String(b.data_execucao||b.data).localeCompare(String(a.data_execucao||a.data))||Number(b.id)-Number(a.id));
  const pageSize=5,totalPages=Math.max(1,Math.ceil(rows.length/pageSize));
  assetTransactionsPage=Math.min(Math.max(1,page),totalPages);
  const visible=rows.slice((assetTransactionsPage-1)*pageSize,assetTransactionsPage*pageSize);
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dateBR=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
  document.getElementById('transactionsModalContent').innerHTML=`
   <div class="tablewrap"><table class="data transaction-modal-table"><thead><tr><th>Tipo de ordem</th><th>Data do lançamento</th><th>Quantidade</th><th>Preço unitário</th><th>Valor total</th><th>Fonte</th><th>Opções</th></tr></thead><tbody>
   ${visible.length?visible.map(op=>`<tr><td><span class="transaction-side ${op.lado==='compra'?'green':'red'}">${op.lado==='compra'?'↻':'↗'} ${op.lado==='compra'?'Compra':'Venda'}</span></td><td>${dateBR(op.data_execucao||op.data)}</td><td>${Number(op.quantidade).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4})}</td><td>${money(op.preco)}</td><td>${money(Number(op.quantidade)*Number(op.preco)+Number(op.custos||0))}</td><td><span class="source-tag">Manual</span></td><td><button class="icon-action" title="Editar" onclick="editAssetOperation(${op.id})">♢</button><button class="icon-action danger" title="Excluir" onclick="deleteAssetOperation(${op.id})">♜</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhum lançamento encontrado para este ativo.</td></tr>'}
   </tbody></table></div>
   ${totalPages>1?`<div class="modal-pagination"><button ${assetTransactionsPage===1?'disabled':''} onclick="openAssetTransactions('${escapeHTML(ticker)}',${assetTransactionsPage-1})">Anterior</button>${Array.from({length:totalPages},(_,i)=>`<button class="${assetTransactionsPage===i+1?'active':''}" onclick="openAssetTransactions('${escapeHTML(ticker)}',${i+1})">${i+1}</button>`).join('')}<button ${assetTransactionsPage===totalPages?'disabled':''} onclick="openAssetTransactions('${escapeHTML(ticker)}',${assetTransactionsPage+1})">Próximo</button></div>`:''}`;
 }catch(e){document.getElementById('transactionsModalContent').innerHTML='<div class="empty">Não foi possível carregar os lançamentos.</div>';}
}
async function deleteAssetOperation(id){
 if(!await appConfirm('Excluir lançamento','Tem certeza de que deseja excluir este lançamento? Esta ação não pode ser desfeita.','Excluir lançamento'))return;
 try{await api('/api/operacoes/'+id,{method:'DELETE'});await refresh();openAssetTransactions(assetTransactionsTicker,assetTransactionsPage);toast('Lançamento excluído.');}catch(e){toast(e.message)}
}
async function editAssetOperation(id){
 document.getElementById('transactionsModalBack').style.display='none';
 await editOperation(Number(id));
}

document.addEventListener('click',e=>{if(!e.target.closest('#assetActionMenu')&&!e.target.closest('.asset-options-trigger'))closeAssetMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAssetMenu()});

function getOpportunityRows(){
 const enabled=enabledCategoryKeys(),all=state.itens||[];
 const totalPortfolio=all.reduce((sum,item)=>sum+Number(item.valor_atual||0),0);
 return all.filter(item=>enabled.has(item.tipo)&&Number(item.preco_atual)>0&&Number(item.preco_medio)>0&&Number(item.preco_atual)<Number(item.preco_medio))
  .sort((a,b)=>(Number(a.preco_atual)/Number(a.preco_medio))-(Number(b.preco_atual)/Number(b.preco_medio)))
  .map(item=>{
   return {...item,portfolioPct:totalPortfolio?Number(item.valor_atual||0)/totalPortfolio*100:0,idealPct:idealPercentForAsset(item)};
  });
}
let opportunityPage=1;
function renderOpportunityModal(){
 const rows=getOpportunityRows(),pageSize=5,totalPages=Math.max(1,Math.ceil(rows.length/pageSize));
 opportunityPage=Math.min(Math.max(1,opportunityPage),totalPages);
 document.getElementById('opportunityMessage').textContent=rows.length
  ?`Você possui ${rows.length} ativo(s) com preço atual abaixo do seu preço médio de aquisição.`
  :'Nenhum ativo está com preço atual abaixo do preço médio de aquisição.';
 const start=(opportunityPage-1)*pageSize,visible=rows.slice(start,start+pageSize);
 document.getElementById('opportunityRows').innerHTML=visible.length?visible.map(item=>`
  <tr>
   <td class="ticker">${escapeHTML(item.ticker)}</td>
   <td>${brl(item.preco_medio)}</td>
   <td class="red">${brl(item.preco_atual)}</td>
   <td>${pct(item.portfolioPct)}</td>
   <td>${pct(item.idealPct)}</td>
  </tr>`).join(''):rowEmpty(5,'Nenhuma oportunidade encontrada.');
 document.getElementById('opportunityPagination').innerHTML=totalPages>1
  ?`<button type="button" onclick="changeOpportunityPage(${opportunityPage-1})" ${opportunityPage===1?'disabled':''}>Anterior</button>${Array.from({length:totalPages},(_,i)=>`<button type="button" class="${opportunityPage===i+1?'active':''}" onclick="changeOpportunityPage(${i+1})">${i+1}</button>`).join('')}<button type="button" onclick="changeOpportunityPage(${opportunityPage+1})" ${opportunityPage===totalPages?'disabled':''}>Próximo</button>`
  :'';
}
function changeOpportunityPage(page){opportunityPage=page;renderOpportunityModal();}
function openOpportunityModal(){opportunityPage=1;renderOpportunityModal();document.getElementById('opportunityBack').style.display='flex';}
function closeOpportunityModal(){document.getElementById('opportunityBack').style.display='none';}


let profitPositionsFilter='lucro',profitPositionsPage=1,fixedIncomeSelectedTicker=null;
function getProfitPositionRows(){
 const rows=(state.itens||[]).filter(item=>Number(item.valor_atual||0)>0);
 return rows.filter(item=>profitPositionsFilter==='lucro'?Number(item.lucro||0)>0:Number(item.lucro||0)<0)
  .sort((a,b)=>profitPositionsFilter==='lucro'?Number(b.lucro_pct||0)-Number(a.lucro_pct||0):Number(a.lucro_pct||0)-Number(b.lucro_pct||0));
}
function renderProfitPositionsModal(){
 document.querySelector('#profitPositionsBack .modalhead h2').textContent=profitPositionsFilter==='lucro'?'Posições no lucro':'Posições no prejuízo';
 const all=getProfitPositionRows(),size=5,totalPages=Math.max(1,Math.ceil(all.length/size));
 profitPositionsPage=Math.min(Math.max(1,profitPositionsPage),totalPages);
 const page=all.slice((profitPositionsPage-1)*size,profitPositionsPage*size);
 document.getElementById('profitPositionsRows').innerHTML=page.length?page.map(item=>{
  const routes={acao:'acoes',fii:'fiis',stocks:'stocks',bdr:'bdrs',etf:'etfs',internacional:'etfs-internacionais',reit:'reits',cripto:'criptomoedas'};
  const route=routes[item.tipo],ticker=String(item.ticker||'').toLowerCase();
  const name=route?`<a class="asset-market-link" href="https://investidor10.com.br/${route}/${encodeURIComponent(ticker)}/" target="_blank" rel="noopener noreferrer">${escapeHTML(item.ticker)}</a>`:escapeHTML(item.ticker);
  const variation=Number(item.preco_medio)>0&&Number(item.preco_atual)>0?(Number(item.preco_atual)/Number(item.preco_medio)-1)*100:null;
  return `<tr><td class="ticker">${name}</td><td>${brl(item.valor_atual)}</td><td><span class="value-pill ${Number(variation||0)>=0?'positive':'negative'}">${variation==null?'—':pct(variation)} ${variation==null?'':variation>=0?'▲':'▼'}</span></td><td><span class="value-pill ${Number(item.lucro_pct)>=0?'positive':'negative'}">${pct(item.lucro_pct)} ${Number(item.lucro_pct)>=0?'↗':'↘'}</span></td></tr>`;
 }).join(''):rowEmpty(4,profitPositionsFilter==='lucro'?'Nenhuma posição no lucro.':'Nenhuma posição no prejuízo.');
 document.getElementById('profitWinnersTab').classList.toggle('active',profitPositionsFilter==='lucro');
 document.getElementById('profitLosersTab').classList.toggle('active',profitPositionsFilter==='prejuizo');
 document.getElementById('profitPositionsPagination').innerHTML=totalPages>1
  ?`<button type="button" onclick="changeProfitPositionsPage(${profitPositionsPage-1})" ${profitPositionsPage===1?'disabled':''}>Anterior</button>${Array.from({length:totalPages},(_,i)=>`<button type="button" class="${profitPositionsPage===i+1?'active':''}" onclick="changeProfitPositionsPage(${i+1})">${i+1}</button>`).join('')}<button type="button" onclick="changeProfitPositionsPage(${profitPositionsPage+1})" ${profitPositionsPage===totalPages?'disabled':''}>Próximo</button>`:'';
}
function openProfitPositionsModal(filter='lucro'){profitPositionsFilter=filter==='prejuizo'?'prejuizo':'lucro';profitPositionsPage=1;renderProfitPositionsModal();document.getElementById('profitPositionsBack').style.display='flex';}
function closeProfitPositionsModal(){document.getElementById('profitPositionsBack').style.display='none';}
function setProfitPositionsFilter(filter){profitPositionsFilter=filter;profitPositionsPage=1;renderProfitPositionsModal();}
function changeProfitPositionsPage(page){profitPositionsPage=page;renderProfitPositionsModal();}

function openFixedIncomeSalePicker(){
 const holdings=(sellableAssets||[]).filter(item=>String(item.tipo||'').toLowerCase()==='renda_fixa'&&Number(item.quantidade)>0);
 fixedIncomeSelectedTicker=null;
 const body=document.getElementById('fixedIncomeSaleRows');
 body.innerHTML=holdings.length?holdings.map((item,index)=>`
  <tr class="fixed-sale-row" data-ticker="${escapeHTML(item.ticker)}" onclick="selectFixedIncomeSale('${escapeHTML(item.ticker)}')">
   <td><label class="fixed-sale-choice"><input type="radio" name="fixedIncomeSaleChoice" value="${escapeHTML(item.ticker)}" onchange="selectFixedIncomeSale('${escapeHTML(item.ticker)}')"><span>${escapeHTML(item.nome||item.ticker)}</span></label></td>
   <td>${brl(item.valor_atual??(Number(item.quantidade)*Number(item.preco_medio)))}</td><td class="muted">›</td>
  </tr>`).join(''):rowEmpty(3,'Nenhum investimento de renda fixa disponível para venda.');
 document.getElementById('fixedIncomeSaleConfirm').disabled=!holdings.length;
 document.getElementById('fixedIncomeSaleBack').style.display='flex';
}
function selectFixedIncomeSale(ticker){
 fixedIncomeSelectedTicker=ticker;
 document.querySelectorAll('.fixed-sale-row').forEach(row=>row.classList.toggle('selected',row.dataset.ticker===ticker));
 const radio=document.querySelector(`input[name="fixedIncomeSaleChoice"][value="${CSS.escape(ticker)}"]`);if(radio)radio.checked=true;
 document.getElementById('fixedIncomeSaleConfirm').disabled=false;
}
function closeFixedIncomeSalePicker(){document.getElementById('fixedIncomeSaleBack').style.display='none';}
function confirmFixedIncomeSale(){
 const item=(sellableAssets||[]).find(x=>String(x.ticker)===String(fixedIncomeSelectedTicker));
 if(!item)return;
 selectedAsset=item;assetInput.value=item.ticker;
 const qty=Number(item.quantidade||0),price=Number(item.preco_atual??item.preco_medio??0);
 quantityInput.value=String(qty);quantityInput.step='0.000001';quantityInput.min='0.000001';
 if(price>0)moneyInput(price);
 updateOperationTotal();
 assetHint.textContent=`Investimento selecionado. Saldo disponível: ${brl(item.valor_atual??qty*price)}.`;
 closeSuggestions();closeFixedIncomeSalePicker();
}

function buildProvPalette(count){
 const hues=[];let step=137.508,index=0;
 while(hues.length<Math.max(1,count)&&index<720){
  const hue=((210+index*step)%360+360)%360;
  // Avoid red hues; reserve them only if every other hue has been exhausted.
  if(!(hue<16||hue>344))hues.push(hue);
  index++;
 }
 return hues.map((h,i)=>`hsl(${h.toFixed(1)} ${66+(i%3)*5}% ${55+(i%4)*3}%)`);
}
function buildProvDistribution(records,title){
 const assetTotals={},typeTotals={};
 (records||[]).filter(x=>!String(x.tipo_evento||x.tipo||'').toUpperCase().includes('AMORTIZA')).forEach(x=>{
  const amount=Number(x.valor_total||0);if(!(amount>0))return;
  const ticker=String(x.ticker||'Outros'),kind=x.tipo_ativo||((state.itens||[]).find(i=>i.ticker===ticker)||{}).tipo||'outros';
  assetTotals[ticker]=(assetTotals[ticker]||0)+amount;typeTotals[kind]=(typeTotals[kind]||0)+amount;
 });
 const assetRows=Object.entries(assetTotals).sort((a,b)=>b[1]-a[1]);
 const typeRows=Object.entries(typeTotals).sort((a,b)=>b[1]-a[1]);
 const palette=buildProvPalette(Math.max(assetRows.length,typeRows.length));
 provDistributionData={
  ativo:assetRows.map(([name,value],i)=>({name,value,color:palette[i]})),
  tipo:typeRows.map(([name,value],i)=>({name:labels[name]||name,value,color:palette[i]}))
 };
 const titleEl=document.getElementById('provDistributionTitle');if(titleEl)titleEl.textContent=title||'Distribuição de proventos em 12 meses';
}
function openProvDistributionForBar(key,mode,status='Pago'){
 const d=state.proventos_dashboard||{},typeSelect=document.getElementById('provTypeFilter'),assetSelect=document.getElementById('provAssetFilter');
 const selectedType=typeSelect?.value||'todos',selectedAsset=assetSelect?.value||'todos';
 const source=status==='A receber'?(d.a_receber||[]):(d.recebidos||[]);
 const records=source.filter(x=>{
  const date=String(x.data_pagamento||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const dt=new Date(date+'T12:00:00');
  const bucket=mode==='anual'?String(dt.getFullYear()):`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
  const kind=x.tipo_ativo||((state.itens||[]).find(i=>i.ticker===x.ticker)||{}).tipo||'outros';
  return bucket===key&&(selectedType==='todos'||kind===selectedType)&&(selectedAsset==='todos'||x.ticker===selectedAsset);
 });
 const title=mode==='anual'?`Distribuição de proventos ${status==='A receber'?'a receber':'recebidos'} em ${key}`:`Distribuição de proventos ${status==='A receber'?'a receber':'recebidos'} em ${key.slice(5,7)}/${key.slice(0,4)}`;
 provDistributionStatus=status;
 buildProvDistribution(records,title);
 const back=document.getElementById('provDistributionBack');
 if(back){back.style.display='flex';setProvDistributionMode(provDistributionMode||'ativo');}
}
window.closeAllProventosMenus=function(){
 // Um único coordenador para todos os menus da página Proventos.
 // Sempre fecha todos os grupos antes que o menu solicitado seja aberto.
 ['provTotalMenu','provChartPeriodMenu',
  'provHistoryStatusMenu','provHistoryTypeMenu','provHistoryAssetMenu',
  'myProvPeriodMenu','myProvTypeMenu','myProvAssetMenu'
 ].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
 ['provTotalTrigger','provChartPeriodTrigger'].forEach(id=>document.getElementById(id)?.setAttribute('aria-expanded','false'));
 ['provHistoryStatusWrap','provHistoryTypeWrap','provHistoryAssetWrap',
  'myProvPeriodWrap','myProvTypeWrap','myProvAssetWrap'
 ].forEach(id=>document.querySelector(`#${id} .prov-history-trigger`)?.setAttribute('aria-expanded','false'));
 if(typeof window.__lwCloseSelectMenu==='function')window.__lwCloseSelectMenu();
};
function toggleProvTotalMenu(){
 const menu=document.getElementById('provTotalMenu'),trigger=document.getElementById('provTotalTrigger');
 if(!menu||!trigger)return;
 const opening=menu.classList.contains('hidden');
 window.closeAllProventosMenus();
 menu.classList.toggle('hidden',!opening);trigger.setAttribute('aria-expanded',String(opening));
}
function closeProvTotalMenu(){
 const menu=document.getElementById('provTotalMenu'),trigger=document.getElementById('provTotalTrigger');
 if(menu)menu.classList.add('hidden');if(trigger)trigger.setAttribute('aria-expanded','false');
}
function setProvTotalPeriod(period){
 if(!['mes','ano','12m'].includes(period))return;
 provTotalPeriod=period;closeProvTotalMenu();renderProventosDashboard();
}
document.addEventListener('click',event=>{if(!event.target.closest('.prov-total-heading'))closeProvTotalMenu();});
function toggleProvChartPeriodMenu(){
 const menu=document.getElementById('provChartPeriodMenu'),trigger=document.getElementById('provChartPeriodTrigger');
 if(!menu||!trigger)return;
 const opening=menu.classList.contains('hidden');
 window.closeAllProventosMenus();
 menu.classList.toggle('hidden',!opening);trigger.setAttribute('aria-expanded',String(opening));
}
function closeProvChartPeriodMenu(){
 const menu=document.getElementById('provChartPeriodMenu'),trigger=document.getElementById('provChartPeriodTrigger');
 if(menu)menu.classList.add('hidden');if(trigger)trigger.setAttribute('aria-expanded','false');
}
function setProvChartRange(value){provChartRange=value;closeProvChartPeriodMenu();renderProventosDashboard();}
document.addEventListener('click',event=>{if(!event.target.closest('.prov-chart-period'))closeProvChartPeriodMenu();});
function renderProvChartPeriodMenu(availableYears){
 const menu=document.getElementById('provChartPeriodMenu'),label=document.getElementById('provChartPeriodLabel');
 if(!menu)return;
 const currentYear=new Date().getFullYear();
 const quick=[['ano_atual',`Ano atual ${currentYear}`],['12m','Últimos 12 meses'],['5a','Últimos 5 anos'],['futuros','Futuros'],['recebidos','Recebidos'],['todos','Recebidos e Futuros']];
 const years=[...new Set(availableYears||[])].filter(y=>/^\d{4}$/.test(String(y))).sort((a,b)=>Number(b)-Number(a));
 const yearValue=provChartRange.startsWith('ano:')?provChartRange.slice(4):'';
 const selectedLabel=quick.find(x=>x[0]===provChartRange)?.[1]||(yearValue?yearValue:'Últimos 12 meses');
 if(label)label.textContent=selectedLabel;
 const option=(value,text)=>`<label class="period-option ${provChartRange===value?'active':''}"><input type="radio" name="provChartPeriodChoice" ${provChartRange===value?'checked':''} onchange="setProvChartRange('${value}')"><span>${text}</span></label>`;
 menu.innerHTML=`<div class="period-title">Período</div><div class="period-section"><div class="period-title">Filtros rápidos</div>${quick.map(([value,text])=>option(value,escapeHTML(text))).join('')}</div><div class="period-divider"></div><div class="period-section"><div class="period-title">Filtro anual</div>${years.map(year=>option('ano:'+year,String(year))).join('')||'<span class="mini">Nenhum ano disponível.</span>'}</div>`;
}
function setProvMode(mode){
 const monthly=document.getElementById('provMonthlyMode'),annual=document.getElementById('provAnnualMode');
 if(monthly)monthly.classList.toggle('active',mode==='mensal');
 if(annual)annual.classList.toggle('active',mode==='anual');
 window.provMode=mode;
 renderProventosDashboard();
}
let provHistoryStatus='todos';
let provHistoryTypes=[];
let provHistoryAssets=[];
function toggleProvHistoryMenu(kind){
 const ids={status:'provHistoryStatusMenu',type:'provHistoryTypeMenu',asset:'provHistoryAssetMenu'};
 const wraps={status:'provHistoryStatusWrap',type:'provHistoryTypeWrap',asset:'provHistoryAssetWrap'};
 const menu=document.getElementById(ids[kind]);if(!menu)return;
 const opening=menu.classList.contains('hidden');
 window.closeAllProventosMenus();
 Object.values(ids).forEach(id=>document.getElementById(id)?.classList.add('hidden'));
 Object.values(wraps).forEach(id=>document.querySelector(`#${id} .prov-history-trigger`)?.setAttribute('aria-expanded','false'));
 if(opening){menu.classList.remove('hidden');document.querySelector(`#${wraps[kind]} .prov-history-trigger`)?.setAttribute('aria-expanded','true');}
}
function closeProvHistoryMenus(){
 ['provHistoryStatusMenu','provHistoryTypeMenu','provHistoryAssetMenu'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
 ['provHistoryStatusWrap','provHistoryTypeWrap','provHistoryAssetWrap'].forEach(id=>document.querySelector(`#${id} .prov-history-trigger`)?.setAttribute('aria-expanded','false'));
}
document.addEventListener('click',event=>{
 if(!event.target.closest('.prov-history-filter'))closeProvHistoryMenus();
});
function setProvHistoryStatus(value){
 provHistoryStatus=value;
 const legacyStatus=document.getElementById('provStatusFilter');if(legacyStatus)legacyStatus.value=value;
 const labels={todos:'Recebidos e Futuros',Pago:'Recebidos','A receber':'Futuros'};
 const label=document.getElementById('provHistoryStatusLabel');if(label)label.textContent=labels[value]||labels.todos;
 renderProventosDashboard();
}
function setProvHistoryType(value){provHistoryTypes=value==='todos'?[]:[value];renderProventosDashboard();}
function setProvHistoryAsset(value){provHistoryAssets=value==='todos'?[]:[value];renderProventosDashboard();}
function setProvHistoryAllTypes(){setProvHistoryType('todos');}
function setProvHistoryAllAssets(){setProvHistoryAsset('todos');}

function renderProvHistoryFilters(rows,eventType){
 const statusMenu=document.getElementById('provHistoryStatusMenu');
 if(statusMenu){
  const choices=[['todos','Recebidos e Futuros'],['Pago','Recebidos'],['A receber','Futuros']];
  statusMenu.innerHTML=choices.map(([value,label])=>`<button type="button" role="option" aria-selected="${provHistoryStatus===value}" class="native-dropdown-option ${provHistoryStatus===value?'active':''}" onclick="setProvHistoryStatus('${value}')">${label}</button>`).join('');
 }
 const typeMenu=document.getElementById('provHistoryTypeMenu');
 const typeValues=[...new Set([...((state.itens||[]).map(x=>x.tipo).filter(Boolean)),...rows.map(eventType).filter(Boolean)])].sort((a,b)=>(labels[a]||a).localeCompare(labels[b]||b,'pt-BR'));
 provHistoryTypes=provHistoryTypes.filter(x=>typeValues.includes(x));
 if(typeMenu){
  const selected=provHistoryTypes[0]||'todos';
  typeMenu.innerHTML=[['todos','Todos os tipos'],...typeValues.map(value=>[value,labels[value]||value])]
   .map(([value,text])=>`<button type="button" role="option" aria-selected="${selected===value}" class="native-dropdown-option ${selected===value?'active':''}" onclick="setProvHistoryType('${escapeHTML(value)}')">${escapeHTML(text)}</button>`).join('');
  const trigger=document.querySelector('#provHistoryTypeWrap .prov-history-trigger span:first-child');
  if(trigger)trigger.textContent=selected==='todos'?'Tipo de ativo':(labels[selected]||selected);
 }
 const assetMenu=document.getElementById('provHistoryAssetMenu');
 const assetValues=[...new Set(rows.map(x=>x.ticker).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 provHistoryAssets=provHistoryAssets.filter(x=>assetValues.includes(x));
 if(assetMenu){
  const selected=provHistoryAssets[0]||'todos';
  assetMenu.innerHTML=[['todos','Todos os ativos'],...assetValues.map(value=>[value,value])]
   .map(([value,text])=>`<button type="button" role="option" aria-selected="${selected===value}" class="native-dropdown-option ${selected===value?'active':''}" onclick="setProvHistoryAsset('${escapeHTML(value)}')">${escapeHTML(text)}</button>`).join('');
  const trigger=document.querySelector('#provHistoryAssetWrap .prov-history-trigger span:first-child');
  if(trigger)trigger.textContent=selected==='todos'?'Ativos':selected;
 }
}

function renderProventosDashboard(){
 const d=state.proventos_dashboard||{},r=state.resumo||{};
 const rows=[...(d.recebidos||[]),...(d.a_receber||[])];
 const received=(d.recebidos||[]).reduce((sum,x)=>sum+Number(x.valor_total||0),0);
 const upcoming=(d.a_receber||[]).reduce((sum,x)=>sum+Number(x.valor_total||0),0);
 const receivedRows=d.recebidos||[];
 const average=Number(d.media_mensal||0),total12=Number(d.total_12m||0);
 const averageEl=document.getElementById('provAverage'),totalEl=document.getElementById('provTotal12'),portfolioEl=document.getElementById('provPortfolioTotal');
 if(portfolioEl)portfolioEl.textContent=brl(receivedRows.reduce((sum,x)=>sum+Number(x.valor_total||0),0));
 const activeIncomeGoal=(state.metas||[]).filter(m=>m.tipo==='proventos').sort((a,b)=>Number(b.id)-Number(a.id))[0];
 let goalAverage=average;
 if(activeIncomeGoal){try{const classes=JSON.parse(activeIncomeGoal.classes||'[]');if(classes.length){const cutoff=new Date();cutoff.setDate(1);cutoff.setMonth(cutoff.getMonth()-11);goalAverage=receivedRows.filter(x=>{const dt=new Date(String(x.data_pagamento||'')+'T12:00:00');const kind=x.tipo_ativo||((state.itens||[]).find(i=>i.ticker===x.ticker)||{}).tipo;return dt>=cutoff&&classes.includes(kind)&&!String(x.tipo_evento||x.tipo||'').toUpperCase().includes('AMORTIZA');}).reduce((sum,x)=>sum+Number(x.valor_total||0),0)/12;}}catch(e){}}
 const displayAverage=activeIncomeGoal?goalAverage:average;if(averageEl)averageEl.textContent=brl(displayAverage);
 const goalTarget=Number(activeIncomeGoal?.objetivo||0),goalPercent=goalTarget>0?goalAverage/goalTarget*100:0;
 const goalLink=document.getElementById('provGoalLink'),goalTargetEl=document.getElementById('provGoalTarget'),goalPercentEl=document.getElementById('provGoalPercent');
 if(goalLink){goalLink.classList.toggle('hidden',!activeIncomeGoal);if(activeIncomeGoal&&goalTargetEl)goalTargetEl.textContent=brl(goalTarget);}
 if(goalPercentEl){goalPercentEl.classList.toggle('hidden',!activeIncomeGoal);goalPercentEl.textContent=activeIncomeGoal?pct(goalPercent):'';}
 const progress=document.getElementById('provAverageProgress');
 if(progress)progress.style.width=`${Math.min(100,activeIncomeGoal&&goalTarget>0?goalPercent:0)}%`;
 const totalPeriod=provTotalPeriod||'12m';
 const today=new Date(),monthStart=new Date(today.getFullYear(),today.getMonth(),1),yearStart=new Date(today.getFullYear(),0,1),rollingStart=new Date(today.getFullYear(),today.getMonth()-11,1);
 const periodStart=totalPeriod==='mes'?monthStart:totalPeriod==='ano'?yearStart:rollingStart;
 const filteredReceived=receivedRows.filter(x=>{const dt=new Date(String(x.data_pagamento||'')+'T12:00:00');return Number.isFinite(dt.getTime())&&dt>=periodStart&&dt<=today;});
 const summaryTotal=filteredReceived.reduce((sum,x)=>sum+Number(x.valor_total||0),0);
 if(totalEl)totalEl.textContent=brl(summaryTotal);
 const totalLabel=document.getElementById('provTotalLabel');if(totalLabel)totalLabel.textContent=totalPeriod==='mes'?'Total do mês':totalPeriod==='ano'?'Total do ano':'Total últimos 12 meses';
 document.querySelectorAll('#provTotalMenu [data-period]').forEach(button=>button.classList.toggle('active',button.dataset.period===totalPeriod));

 const typeSelect=document.getElementById('provTypeFilter'),assetSelect=document.getElementById('provAssetFilter');
 const priorType=typeSelect?.value||'todos',priorAsset=assetSelect?.value||'todos';
 const typeMap=new Map((state.itens||[]).map(x=>[x.tipo,labels[x.tipo]||x.tipo]));
 rows.forEach(x=>{const kind=x.tipo_ativo||((state.itens||[]).find(i=>i.ticker===x.ticker)||{}).tipo;if(kind&&!typeMap.has(kind))typeMap.set(kind,labels[kind]||kind);});
 if(typeSelect){typeSelect.innerHTML='<option value="todos">Tipo de ativo</option>'+[...typeMap].map(([v,l])=>`<option value="${escapeHTML(v)}">${escapeHTML(l)}</option>`).join('');typeSelect.value=typeMap.has(priorType)?priorType:'todos';}
 const assetOptions=[...new Set(rows.map(x=>x.ticker).filter(Boolean))].sort();
 if(assetSelect){assetSelect.innerHTML='<option value="todos">Ativos</option>'+assetOptions.map(t=>`<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');assetSelect.value=assetOptions.includes(priorAsset)?priorAsset:'todos';}
 const selectedType=typeSelect?.value||'todos',selectedAsset=assetSelect?.value||'todos';
 const status=document.getElementById('provStatusFilter')?.value||'todos';
 const eventType=x=>x.tipo_ativo||((state.itens||[]).find(i=>i.ticker===x.ticker)||{}).tipo||'outros';
 const filtered=rows.filter(x=>
  (selectedType==='todos'||eventType(x)===selectedType)&&(selectedAsset==='todos'||x.ticker===selectedAsset)&&(status==='todos'||x.status===status)
 ).sort((a,b)=>String(b.data_pagamento).localeCompare(String(a.data_pagamento)));

 // A distribuição considera apenas renda recebida nos últimos 12 meses;
 // amortizações são listadas, mas não entram como rendimento.
 const distributionNow=new Date(),firstDistribution=new Date(distributionNow.getFullYear(),distributionNow.getMonth()-11,1);
 const distribution={};
 (d.recebidos||[]).filter(x=>{const dt=new Date(String(x.data_pagamento||'')+'T12:00:00');return (selectedType==='todos'||eventType(x)===selectedType)&&(selectedAsset==='todos'||x.ticker===selectedAsset)&&!String(x.tipo_evento||x.tipo||'').toUpperCase().includes('AMORTIZA')&&Number.isFinite(dt.getTime())&&dt>=firstDistribution;}).forEach(x=>distribution[x.ticker]=(distribution[x.ticker]||0)+Number(x.valor_total||0));
 const syncStatus=document.getElementById('proventosSyncStatus');
 if(syncStatus){
  const sync=d.sincronizacao||{};
  const when=sync.ultima_sincronizacao?new Date(sync.ultima_sincronizacao).toLocaleString('pt-BR'):'ainda não sincronizado';
  const imported=Number(sync.importados||0);
  const ignored=Number(sync.ignorados||0);
  const errors=Array.isArray(sync.erros)?sync.erros:[];
  const errorDetails=errors.length?`<details class="prov-sync-details"><summary>Detalhes técnicos (${errors.length})</summary><div>${errors.map(error=>`<p>${escapeHTML(String(error))}</p>`).join('')}</div></details>`:'';
  syncStatus.innerHTML=`<span class="prov-sync-summary">${imported} evento(s) novo(s) · ${ignored} ignorado(s) · Atualizado: ${escapeHTML(when)}</span>${errorDetails}`;
 }
 const distNames=Object.keys(distribution).sort((a,b)=>distribution[b]-distribution[a]);
 const distValues=distNames.map(k=>distribution[k]);
 const distTotal=distValues.reduce((a,b)=>a+b,0);
 const typeDistribution={};
 distNames.forEach(ticker=>{const sample=(d.recebidos||[]).find(x=>x.ticker===ticker);const kind=sample?.tipo_ativo||((state.itens||[]).find(i=>i.ticker===ticker)||{}).tipo||'outros';typeDistribution[kind]=(typeDistribution[kind]||0)+distribution[ticker];});
 const palette=buildProvPalette(Math.max(distNames.length,Object.keys(typeDistribution).length));
 provDistributionData={ativo:distNames.map((name,i)=>({name,value:distValues[i],color:palette[i%palette.length]})),tipo:Object.keys(typeDistribution).sort((a,b)=>typeDistribution[b]-typeDistribution[a]).map((name,i)=>({name:labels[name]||name,value:typeDistribution[name],color:palette[i%palette.length]}))};
 chart('provDistributionChart','doughnut',{labels:distNames.slice(0,3),datasets:[{data:distValues.slice(0,3),backgroundColor:distNames.slice(0,3).map((_,i)=>palette[i%palette.length]),borderWidth:0}]},{cutout:'66%',plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${brl(ctx.raw||0)}`}}}});
 const legend=document.getElementById('provDistributionLegend');
 if(legend)legend.innerHTML=distNames.length?distNames.slice(0,3).map((name,i)=>{const sum=distValues[i],share=distTotal?sum/distTotal*100:0;return `<div class="earnings-legend-row" title="${brl(sum)}"><span><i style="background:${palette[i%palette.length]}"></i>${escapeHTML(name)}</span><b>${pct(share)}</b></div>`}).join(''):'<div class="mini">Nenhum provento recebido.</div>';
 // Use actual event dates and values for the dashboard. No synthetic historical values are created.
 const mode=window.provMode||'mensal';
 const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1),todayISO=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
 const keyFor=(value)=>{const date=new Date(value+'T12:00:00');return mode==='anual'?String(date.getFullYear()):`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`};
 const chartRange=provChartRange||'12m';
 const allChartRows=rows.filter(x=>{
  const date=String(x.data_pagamento||'');if(!validDate(date))return false;
  const dt=new Date(date+'T12:00:00'),year=date.slice(0,4),dateKey=date.slice(0,7);
  if(chartRange==='ano_atual')return Number(year)===now.getFullYear();
  if(chartRange==='12m'){const cutoff=new Date(first.getFullYear(),first.getMonth()-11,1);return dt>=cutoff&&date<=todayISO;}
  if(chartRange==='5a')return Number(year)>=now.getFullYear()-4&&Number(year)<=now.getFullYear();
  if(chartRange==='futuros')return x.status==='A receber'&&date>=todayISO;
  if(chartRange==='recebidos')return x.status==='Pago';
  if(chartRange==='todos')return true;
  if(chartRange.startsWith('ano:'))return year===chartRange.slice(4);
  return true;
 });
 const sums={};
 allChartRows.forEach(x=>{
  const key=keyFor(String(x.data_pagamento||''));if(!sums[key])sums[key]={recebido:0,a_receber:0};
  if(x.status==='Pago')sums[key].recebido+=Number(x.valor_total||0);else sums[key].a_receber+=Number(x.valor_total||0);
 });
 let keys=Object.keys(sums).sort();
 if(mode==='mensal'&&chartRange==='12m'){
  const historyKeys=[];for(let i=0;i<12;i++){const dt=new Date(first.getFullYear(),first.getMonth()-11+i,1);historyKeys.push(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`);}
  keys=[...historyKeys,...keys.filter(k=>k>historyKeys[11])];
 }
 if(mode==='mensal'&&chartRange==='5a'){
  const historyKeys=[];for(let i=0;i<60;i++){const dt=new Date(first.getFullYear(),first.getMonth()-59+i,1);historyKeys.push(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`);}
  keys=[...historyKeys,...keys.filter(k=>k>historyKeys[59])];
 }
 if(mode==='mensal'&&chartRange==='ano_atual')keys=Array.from({length:12},(_,i)=>`${now.getFullYear()}-${String(i+1).padStart(2,'0')}`);
 if(mode==='anual'&&keys.length){const min=Number(keys[0]),max=Number(keys[keys.length-1]);keys=Array.from({length:max-min+1},(_,i)=>String(min+i));}
 const availableYears=[...new Set(rows.filter(x=>validDate(x.data_pagamento)).map(x=>String(x.data_pagamento).slice(0,4)))];
 renderProvChartPeriodMenu(availableYears);
 const labelsChart=keys.map(k=>mode==='anual'?k:`${k.slice(5,7)}/${k.slice(0,4)}`);
 const got=keys.map(k=>Number((sums[k]?.recebido||0).toFixed(2))),due=keys.map(k=>Number((sums[k]?.a_receber||0).toFixed(2)));
 chart('provMonthlyChart','bar',{labels:labelsChart,datasets:[{label:'Proventos recebidos',data:got,backgroundColor:'#477bd0',borderRadius:4,stack:'proventos'},{label:'Proventos a receber',data:due,backgroundColor:'#b9c9e8',borderRadius:4,stack:'proventos'}]},{onClick:(event,elements)=>{if(!elements?.length)return;const hit=elements[0],index=hit.index;if(index>=0&&keys[index])openProvDistributionForBar(keys[index],mode,hit.datasetIndex===1?'A receber':'Pago');},onHover:(event,elements)=>{if(event?.native?.target)event.native.target.style.cursor=elements?.length?'pointer':'default';},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${brl(ctx.raw||0)}`}}},scales:{x:{stacked:true,ticks:{color:'#8f99a8'},grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{color:'#8f99a8',callback:v=>'R$ '+Number(v).toLocaleString('pt-BR')},grid:{color:'#303541'}}}});
 const totalReceived=got.reduce((a,b)=>a+b,0);
 const totalUpcoming=due.reduce((a,b)=>a+b,0);
 const totalFiltered=totalReceived+totalUpcoming;
 const totalHeader=document.getElementById('provMonthlyTotal');
 if(totalHeader){
  totalHeader.textContent=`Total no filtro: ${brl(totalFiltered)} · Recebidos: ${brl(totalReceived)} · A receber: ${brl(totalUpcoming)}`;
  totalHeader.title='Soma dos proventos já pagos e dos pagamentos anunciados no período selecionado.';
 }

 const historyRows=rows.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x.data_pagamento||'')));
 renderProvHistoryFilters(historyRows,eventType);
 const historyFiltered=historyRows.filter(x=>
  (provHistoryStatus==='todos'||x.status===provHistoryStatus)&&
  (!provHistoryTypes.length||provHistoryTypes.includes(eventType(x)))&&
  (!provHistoryAssets.length||provHistoryAssets.includes(x.ticker))
 );
 const byYear={};
 historyFiltered.forEach(x=>{
  const date=String(x.data_pagamento),year=date.slice(0,4),month=Number(date.slice(5,7))-1;
  if(month<0||month>11)return;
  if(!byYear[year])byYear[year]=Array(12).fill(0);
  byYear[year][month]+=Number(x.valor_total||0);
 });
 const years=Object.keys(byYear).filter(y=>byYear[y].some(v=>v!==0)).sort().reverse();
 const historyTotal=historyFiltered.reduce((sum,x)=>sum+Number(x.valor_total||0),0);
 const historyTotalEl=document.getElementById('provHistoryTotal');
 if(historyTotalEl)historyTotalEl.textContent=`Total ${brl(historyTotal)}`;
 const history=document.getElementById('provMonthlyRows');
 if(history)history.innerHTML=years.length?years.map(year=>{const vals=byYear[year],sum=vals.reduce((a,b)=>a+b,0);return `<tr><td class="ticker">${year}</td>${vals.map(v=>`<td>${brl(v)}</td>`).join('')}<td class="green">${brl(sum)}</td></tr>`}).join(''):`<tr><td colspan="14" class="empty">Nenhum provento encontrado para os filtros selecionados.</td></tr>`;
 const myRows=filterMyProvents(rows,eventType);
 const myTotal=myRows.reduce((sum,x)=>sum+Number(x.valor_total||0),0);
 const myTotalEl=document.getElementById('myProvTotal');if(myTotalEl)myTotalEl.textContent=`Total ${brl(myTotal)}`;
 renderMyProvFilters(rows,eventType);
 const table=document.getElementById('provRows'),pagination=document.getElementById('myProvPagination');
 const pageSize=30,totalPages=Math.max(1,Math.ceil(myRows.length/pageSize));
 myProvPage=Math.min(Math.max(1,myProvPage),totalPages);
 if(table){
  const start=(myProvPage-1)*pageSize,visible=myRows.slice(start,start+pageSize);
  table.innerHTML=visible.length?visible.map(x=>`<tr><td class="ticker">${escapeHTML(x.ticker||'—')}${x.remarks?`<div class="mini">${escapeHTML(x.remarks)}</div>`:''}</td><td>${escapeHTML(x.tipo||'Provento')}</td><td><span class="prov-status ${x.status==='A receber'?'pending':''}">${escapeHTML(x.status||'—')}</span></td><td>${x.data_com?new Date(x.data_com+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td><td>${x.data_pagamento?new Date(x.data_pagamento+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td><td>${x.quantidade??'—'}</td><td>${x.valor_por_ativo!==null&&x.valor_por_ativo!==undefined?brl(x.valor_por_ativo):'—'}</td><td class="${x.status==='Pago'?'green':'blue'}">${brl(x.valor_total)}</td></tr>`).join(''):rowEmpty(8,'Nenhum provento encontrado para os filtros selecionados.');
 }
 if(pagination){
  if(totalPages<=1)pagination.innerHTML='';
  else{
   let pages=[];
   if(totalPages<=7)pages=Array.from({length:totalPages},(_,i)=>i+1);
   else if(myProvPage<=4)pages=[1,2,3,4,5,'…',totalPages];
   else if(myProvPage>=totalPages-3)pages=[1,'…',totalPages-4,totalPages-3,totalPages-2,totalPages-1,totalPages];
   else pages=[1,'…',myProvPage-1,myProvPage,myProvPage+1,'…',totalPages];
   pagination.innerHTML=`<button type="button" ${myProvPage===1?'disabled':''} onclick="setMyProvPage(${myProvPage-1})">Anterior</button>`+pages.map(page=>page==='…'?'<span class="page-ellipsis">…</span>':`<button type="button" class="${myProvPage===page?'active':''}" aria-current="${myProvPage===page?'page':'false'}" onclick="setMyProvPage(${page})">${page}</button>`).join('')+`<button type="button" ${myProvPage===totalPages?'disabled':''} onclick="setMyProvPage(${myProvPage+1})">Próximo</button>`;
  }
 }
}

let myProvPeriod='ano_atual',myProvMonthYear=new Date().getFullYear(),myProvTypes=[],myProvAssets=[],myProvPage=1;
function setMyProvPage(page){myProvPage=Math.max(1,Number(page)||1);renderProventosDashboard();document.getElementById('myProvPagination')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
function closeMyProvMenus(){
 ['myProvPeriodMenu','myProvTypeMenu','myProvAssetMenu'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
 ['myProvPeriodWrap','myProvTypeWrap','myProvAssetWrap'].forEach(id=>document.querySelector(`#${id} .prov-history-trigger`)?.setAttribute('aria-expanded','false'));
}
function toggleMyProvMenu(kind){
 const ids={period:'myProvPeriodMenu',type:'myProvTypeMenu',asset:'myProvAssetMenu'};
 const wraps={period:'myProvPeriodWrap',type:'myProvTypeWrap',asset:'myProvAssetWrap'};
 const target=document.getElementById(ids[kind]),opening=target?.classList.contains('hidden');
 window.closeAllProventosMenus();
 Object.values(ids).forEach(id=>document.getElementById(id)?.classList.add('hidden'));
 Object.values(wraps).forEach(id=>document.querySelector(`#${id} .prov-history-trigger`)?.setAttribute('aria-expanded','false'));
 if(target&&opening){target.classList.remove('hidden');document.querySelector(`#${wraps[kind]} .prov-history-trigger`)?.setAttribute('aria-expanded','true');}
}
document.addEventListener('click',event=>{if(!event.target.closest('.my-prov-filter')){['myProvPeriodMenu','myProvTypeMenu','myProvAssetMenu'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));['myProvPeriodWrap','myProvTypeWrap','myProvAssetWrap'].forEach(id=>document.querySelector(`#${id} .prov-history-trigger`)?.setAttribute('aria-expanded','false'));}});
function setMyProvPeriod(value){myProvPeriod=value;myProvPage=1;renderProventosDashboard();}
function setMyProvMonthYear(delta){myProvMonthYear=Math.max(1900,Math.min(2200,myProvMonthYear+delta));myProvPage=1;renderProventosDashboard();}
function setMyProvType(value){myProvTypes=value==='todos'?[]:[value];myProvPage=1;renderProventosDashboard();}
function setMyProvAllTypes(){setMyProvType('todos');}
function setMyProvAsset(value){myProvAssets=value==='todos'?[]:[value];myProvPage=1;renderProventosDashboard();}
function setMyProvAllAssets(){setMyProvAsset('todos');}

function filterMyProvents(rows,eventType){
 const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),startMonth=new Date(now.getFullYear(),now.getMonth(),1);
 const valid=rows.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x.data_pagamento||'')));
 return valid.filter(x=>{
  const dt=new Date(String(x.data_pagamento)+'T12:00:00'),status=x.status||'';
  let inPeriod=true;
  if(myProvPeriod==='ano_atual')inPeriod=dt.getFullYear()===now.getFullYear();
  else if(myProvPeriod==='30d'){const cut=new Date(today);cut.setDate(cut.getDate()-29);inPeriod=dt>=cut&&dt<=today;}
  else if(myProvPeriod==='12m'){const cut=new Date(now.getFullYear(),now.getMonth()-11,1);inPeriod=dt>=cut&&dt<=today;}
  else if(myProvPeriod==='5a')inPeriod=dt.getFullYear()>=now.getFullYear()-4&&dt.getFullYear()<=now.getFullYear();
  else if(myProvPeriod==='mes_atual')inPeriod=dt>=startMonth&&dt<new Date(now.getFullYear(),now.getMonth()+1,1);
  else if(myProvPeriod==='proximo_mes'){const next=new Date(now.getFullYear(),now.getMonth()+1,1);inPeriod=dt.getFullYear()===next.getFullYear()&&dt.getMonth()===next.getMonth();}
  else if(myProvPeriod==='futuros')inPeriod=status==='A receber';
  else if(myProvPeriod==='recebidos')inPeriod=status==='Pago';
  else if(myProvPeriod.startsWith('mes:')){const [,year,month]=myProvPeriod.split(':');inPeriod=dt.getFullYear()===Number(year)&&dt.getMonth()+1===Number(month);}
  return inPeriod&&(!myProvTypes.length||myProvTypes.includes(eventType(x)))&&(!myProvAssets.length||myProvAssets.includes(x.ticker));
 }).sort((a,b)=>String(b.data_pagamento).localeCompare(String(a.data_pagamento)));
}
function renderMyProvFilters(rows,eventType){
 const menu=document.getElementById('myProvPeriodMenu'),label=document.getElementById('myProvPeriodLabel');
 const quick=[['ano_atual',`Ano atual ${new Date().getFullYear()}`],['30d','Últimos 30 dias'],['12m','Últimos 12 meses'],['5a','Últimos 5 anos'],['mes_atual','Mês atual'],['proximo_mes','Próximo mês'],['futuros','Futuros'],['recebidos','Recebidos'],['todos','Todos']];
 const monthNames=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
 const quickLabel=quick.find(x=>x[0]===myProvPeriod)?.[1];
 if(label)label.textContent=quickLabel||(myProvPeriod.startsWith('mes:')?`${monthNames[Number(myProvPeriod.split(':')[2])-1]}/${myProvPeriod.split(':')[1]}`:'Ano atual');
 const option=(value,text)=>`<label class="period-option ${myProvPeriod===value?'active':''}"><input type="radio" name="myProvPeriodChoice" ${myProvPeriod===value?'checked':''} onchange="setMyProvPeriod('${value}')"><span>${text}</span></label>`;
 if(menu)menu.innerHTML=`<div class="period-title">Período</div><div class="period-section"><div class="period-title">Filtros rápidos</div>${quick.map(([v,t])=>option(v,escapeHTML(t))).join('')}</div><div class="period-divider"></div><div class="period-section"><div class="period-title">Filtro mensal</div><div class="my-prov-month-nav"><button type="button" aria-label="Ano anterior" onclick="setMyProvMonthYear(-1)">‹</button><span>${myProvMonthYear}</span><button type="button" aria-label="Próximo ano" onclick="setMyProvMonthYear(1)">›</button></div><div class="period-months">${monthNames.map((m,i)=>option(`mes:${myProvMonthYear}:${String(i+1).padStart(2,'0')}`,m)).reverse().join('')}</div></div>`;
 const typeMenu=document.getElementById('myProvTypeMenu'),typeValues=[...new Set([...((state.itens||[]).map(x=>x.tipo).filter(Boolean)),...rows.map(eventType).filter(Boolean)])].sort((a,b)=>(labels[a]||a).localeCompare(labels[b]||b,'pt-BR'));
 myProvTypes=myProvTypes.filter(x=>typeValues.includes(x));
 const selectedType=myProvTypes[0]||'todos';
 if(typeMenu){
  typeMenu.innerHTML=[['todos','Todos os tipos'],...typeValues.map(v=>[v,labels[v]||v])]
   .map(([value,text])=>`<button type="button" role="option" aria-selected="${selectedType===value}" class="native-dropdown-option ${selectedType===value?'active':''}" onclick="setMyProvType('${escapeHTML(value)}')">${escapeHTML(text)}</button>`).join('');
  const trigger=document.querySelector('#myProvTypeWrap .prov-history-trigger span:first-child');
  if(trigger)trigger.textContent=selectedType==='todos'?'Tipo de ativo':(labels[selectedType]||selectedType);
 }
 const assetMenu=document.getElementById('myProvAssetMenu'),assetValues=[...new Set(rows.map(x=>x.ticker).filter(Boolean))].sort();
 myProvAssets=myProvAssets.filter(x=>assetValues.includes(x));
 const selectedAsset=myProvAssets[0]||'todos';
 if(assetMenu){
  assetMenu.innerHTML=[['todos','Todos os ativos'],...assetValues.map(v=>[v,v])]
   .map(([value,text])=>`<button type="button" role="option" aria-selected="${selectedAsset===value}" class="native-dropdown-option ${selectedAsset===value?'active':''}" onclick="setMyProvAsset('${escapeHTML(value)}')">${escapeHTML(text)}</button>`).join('');
  const trigger=document.querySelector('#myProvAssetWrap .prov-history-trigger span:first-child');
  if(trigger)trigger.textContent=selectedAsset==='todos'?'Ativos':selectedAsset;
 }
}
function openProvDistributionModal(){
 const back=document.getElementById('provDistributionBack');if(!back)return;
 const d=state.proventos_dashboard||{},now=new Date(),cutoff=new Date(now.getFullYear(),now.getMonth()-11,1);
 const records=(d.recebidos||[]).filter(x=>{
  const date=String(x.data_pagamento||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const dt=new Date(date+'T12:00:00');
  return dt>=cutoff&&dt<=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59);
 });
 provDistributionStatus='Pago';
 buildProvDistribution(records,'Distribuição de proventos recebidos em 12 meses');
 back.style.display='flex';setProvDistributionMode(provDistributionMode||'ativo');
}
function closeProvDistributionModal(){const back=document.getElementById('provDistributionBack');if(back)back.style.display='none';}
function setProvDistributionMode(mode){provDistributionMode=mode;document.getElementById('provDistAssetTab')?.classList.toggle('active',mode==='ativo');document.getElementById('provDistTypeTab')?.classList.toggle('active',mode==='tipo');const items=provDistributionData[mode]||[];const total=items.reduce((sum,x)=>sum+Number(x.value||0),0);const totalEl=document.getElementById('provDistributionTotal');if(totalEl)totalEl.textContent=brl(total);const list=document.getElementById('provDistributionDetailList');if(list)list.innerHTML=items.length?items.map(item=>`<div class="prov-distribution-item" data-tooltip="${provDistributionStatus==='A receber'?'Previsto':'Recebido'}: ${brl(item.value)}"><span><i style="background:${item.color}"></i>${escapeHTML(item.name)}</span><b>${pct(total?item.value/total*100:0)}</b></div>`).join(''):`<div class="empty">Nenhum provento ${provDistributionStatus==='A receber'?'previsto':'recebido'} no período.</div>`;chart('provDistributionDetailChart','doughnut',{labels:items.map(x=>x.name),datasets:[{data:items.map(x=>x.value),backgroundColor:items.map(x=>x.color),borderWidth:0}]},{cutout:'48%',plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${brl(ctx.raw||0)}`}}}});}

const chartPalette=['#78b7f5','#f3d978','#42d49b','#b59af3','#ed8e9c','#74d7d2','#d7a36a','#e8a56b','#a8b7cb','#d98ad0','#f28f5b','#88c1a8','#c49aeb','#d9c46a','#78a8d8','#e57da9','#9cc36b','#b6a0d8'];
function renderEvolutionChart(canvasId='aporteChart',periodId='aportePeriod',typeId='aporteType'){
 const ops=state.operacoes||[];
 const period=document.getElementById(periodId)?.value||'12';
 const selectedType=document.getElementById(typeId)?.value||'todos';
 const now=new Date(),end=new Date(now.getFullYear(),now.getMonth(),1);
 const count=period==='all'?null:Number(period);
 const snapshotDate=String(state.data_base_snapshot||'').slice(0,10);
 const snapshotMonth=/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)?snapshotDate.slice(0,7):'';
 const snapshotRows=(state.saldos_importados||[]).filter(item=>selectedType==='todos'||item.tipo===selectedType);
 const snapshotCost=snapshotRows.reduce((sum,item)=>sum+Number(item.quantidade||0)*Number(item.preco_medio||0),0);
 const positionsApplied=(state.itens||[]).filter(item=>selectedType==='todos'||item.tipo===selectedType)
  .reduce((sum,item)=>sum+Number(item.investido??(Number(item.quantidade||0)*Number(item.preco_medio||0))),0);
 const summaryApplied=selectedType==='todos'?Number(state.resumo?.investido||0):0;
 // Para Todos os tipos, o resumo do servidor é a referência consolidada mais
 // confiável. Em filtros específicos, usa-se a soma da classe na fotografia.
 // Isso evita desenhar só o ganho de capital quando o saldo-base vem vazio ou
 // parcial no payload de uma instalação que já possui posições.
 const snapshotApplied=selectedType==='todos'
  ? Math.max(0,summaryApplied,snapshotCost,positionsApplied)
  : Math.max(0,snapshotCost,positionsApplied);
 let start;
 if(count){start=new Date(end.getFullYear(),end.getMonth()-count+1,1)}
 else{
  const dates=ops.map(op=>String(op.data||'').slice(0,7)).filter(x=>/^\d{4}-\d{2}$/.test(x));
  if(snapshotMonth)dates.push(snapshotMonth);
  dates.sort();
  start=dates.length?new Date(Number(dates[0].slice(0,4)),Number(dates[0].slice(5,7))-1,1):end;
 }
 const monthKeys=[];
 for(let d=new Date(start);d<=end;d=new Date(d.getFullYear(),d.getMonth()+1,1)){
  monthKeys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
 }
 const eligibleOps=ops.filter(op=>selectedType==='todos'||op.tipo===selectedType).map(op=>({...op,_date:String(op.data_execucao||op.data||'').slice(0,10)})).filter(op=>/^\d{4}-\d{2}-\d{2}$/.test(op._date));
 const netFor=predicate=>eligibleOps.filter(predicate).reduce((sum,op)=>sum+(op.lado==='venda'?-1:1)*(Number(op.quantidade||0)*Number(op.preco||0)+Number(op.custos||0)),0);
 const firstMonth=monthKeys[0]||'';
 let running=0;
 if(firstMonth&&snapshotMonth&&snapshotMonth<firstMonth){
  // O saldo-base substitui todo o histórico anterior; só somamos operações posteriores a ele.
  running=snapshotApplied+netFor(op=>op._date>snapshotDate&&op._date<`${firstMonth}-01`);
 }else if(firstMonth){
  running=netFor(op=>op._date<`${firstMonth}-01`&&(!snapshotDate||op._date<=snapshotDate));
 }
 const cumulative=monthKeys.map(month=>{
  if(snapshotMonth&&month===snapshotMonth){
   // A posição-base já contém as compras anteriores: substitui, não soma, o histórico prévio.
   running=snapshotApplied+netFor(op=>op._date>snapshotDate&&op._date.startsWith(month));
  }else if(!snapshotMonth||month<snapshotMonth){
   running+=netFor(op=>op._date.startsWith(month));
  }else{
   running+=netFor(op=>op._date>snapshotDate&&op._date.startsWith(month));
  }
  return Number(Math.max(0,running).toFixed(2));
 });
 // Se a janela selecionada começa depois da fotografia, a primeira barra da
 // janela deve carregar o saldo-base, acrescido apenas das operações posteriores.
 if(snapshotApplied>0&&snapshotMonth&&monthKeys.length&&snapshotMonth<monthKeys[0]){
  const firstMonth=monthKeys[0];
  cumulative[0]=Number(Math.max(0,snapshotApplied+netFor(op=>op._date>snapshotDate&&op._date<`${firstMonth}-01`)).toFixed(2));
  for(let i=1;i<monthKeys.length;i++){
   const prev=monthKeys[i-1],current=monthKeys[i];
   cumulative[i]=Number(Math.max(0,cumulative[i-1]+netFor(op=>op._date>snapshotDate&&op._date.startsWith(current))).toFixed(2));
  }
 }
 // Garantia final: o mês da fotografia (ou o último mês da janela) nunca pode
 // perder o capital aplicado por falta de operações históricas anteriores.
 if(snapshotApplied>0&&monthKeys.length){
  const baseIndex=snapshotMonth?monthKeys.indexOf(snapshotMonth):-1;
  const targetIndex=baseIndex>=0?baseIndex:monthKeys.length-1;
  if(cumulative[targetIndex]<=0)cumulative[targetIndex]=Number(snapshotApplied.toFixed(2));
 }
 const isSummary=canvasId==='aporteChart';
 const performance=selectedType==='todos'
  ?(state.rentabilidade_historica||{})
  :((state.rentabilidade_por_tipo||{})[selectedType]||{});
 const historical=(performance.series_patrimonio||[]).filter(row=>row&&/^\d{4}-\d{2}$/.test(String(row.mes||'')));
 const visibleHistory=count?historical.slice(-count):historical;
 if(visibleHistory.length){
  const labels=visibleHistory.map(row=>row.mes.slice(5,7)+'/'+row.mes.slice(0,4));
  const applied=visibleHistory.map(row=>Number(row.aplicado||0));
  const gains=visibleHistory.map(row=>Number(row.ganho||0));
  const note=document.querySelector(`#${canvasId}`)?.closest('.panel')?.querySelector('.chart-footnote');
  if(note){
   const missing=Number(performance.ativos_sem_historico?.length||0);
   note.textContent=missing
    ? `Patrimônio histórico em barras, com valor aplicado e ganho ou prejuízo mensal. ${missing} ativo(s) sem histórico foram excluídos do cálculo.`
    : 'Patrimônio histórico em barras: valor aplicado e ganho ou prejuízo de capital em cada mês. Considera fechamentos mensais, compras e vendas; a cobertura depende das APIs configuradas.';
  }
  chart(canvasId,'bar',{labels,datasets:[
   {label:'Valor aplicado',data:applied,backgroundColor:'#28b579',borderRadius:3,stack:'patrimonio'},
   {label:'Ganho de Capital',data:gains,backgroundColor:'#9be8c3',borderRadius:3,stack:'patrimonio'}
  ]},{interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#b8c1ce'}},tooltip:{
   mode:'index',intersect:false,
   backgroundColor:'#11151d',titleColor:'#f4f6fa',bodyColor:'#d7deea',
   borderColor:'#303846',borderWidth:1,cornerRadius:12,padding:14,
   displayColors:true,boxPadding:5,
   callbacks:{
    title:items=>{const row=visibleHistory[items?.[0]?.dataIndex||0];return row?row.mes.slice(5,7)+'/'+row.mes.slice(2,4):'';},
    beforeBody:items=>{const row=visibleHistory[items?.[0]?.dataIndex||0];if(!row)return [];return [`Patrimônio: ${brl(Number(row.patrimonio||0))}`];},
    label:ctx=>`${ctx.dataset.label}: ${brl(ctx.raw||0)}`
   }
  }},scales:{x:{stacked:true,ticks:{color:'#8f99a8'},grid:{display:false}},y:{stacked:true,ticks:{color:'#8f99a8',callback:v=>'R$ '+Number(v).toLocaleString('pt-BR')},grid:{color:'#303541'}}}});
  return;
 }
 // Fallback for classes without historical market-price coverage, such as manually registered fixed income.
 if(isSummary){
  const itemGain=(state.itens||[]).filter(item=>selectedType==='todos'||item.tipo===selectedType)
   .reduce((sum,item)=>sum+Number(item.lucro||0),0);
  const gain=itemGain!==0?itemGain:(selectedType==='todos'?Number(state.resumo?.lucro||0):0);
  const gains=monthKeys.map((_,index)=>index===monthKeys.length-1?Number(gain.toFixed(2)):0);
  const note=document.querySelector(`#${canvasId}`)?.closest('.panel')?.querySelector('.chart-footnote');
  if(note)note.textContent='Sem histórico mensal disponível para os ativos selecionados. Exibindo aportes registrados e o resultado atual.';
  chart(canvasId,'bar',{labels:monthKeys.map(m=>m.slice(5,7)+'/'+m.slice(0,4)),datasets:[
   {label:'Valor aplicado',data:cumulative,backgroundColor:'#28b579',borderRadius:3,stack:'patrimonio'},
   {label:'Resultado atual',data:gains,backgroundColor:'#9be8c3',borderRadius:3,stack:'patrimonio'}
  ]},{plugins:{legend:{labels:{color:'#b8c1ce'}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${brl(ctx.raw||0)}`}}},scales:{x:{stacked:true,ticks:{color:'#8f99a8'},grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{color:'#8f99a8',callback:v=>'R$ '+Number(v).toLocaleString('pt-BR')},grid:{color:'#303541'}}}});
  return;
 }
 chart(canvasId,'bar',{labels:monthKeys.map(m=>m.slice(5,7)+'/'+m.slice(0,4)),datasets:[{label:'Valor aplicado acumulado',data:cumulative,backgroundColor:'#31b77e',borderRadius:3}]},{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#8f99a8'},grid:{display:false}},y:{beginAtZero:true,ticks:{color:'#8f99a8',callback:v=>'R$ '+Number(v).toLocaleString('pt-BR')},grid:{color:'#303541'}}}});
}
function getDistinctChartColors(count){
 const total=Math.max(1,Number(count)||1),hues=[];
 // Prioriza tons frios e evita vermelho enquanto houver alternativas.
 for(let index=0;hues.length<total&&index<1200;index++){
  const hue=(210+index*137.507764)%360;
  if(hue<18||hue>342)continue;
  if(hues.some(existing=>Math.abs(existing-hue)<13||Math.abs(existing-hue)>347))continue;
  hues.push(hue);
 }
 for(let index=0;hues.length<total&&index<120;index++){
  const hue=(index*137.507764)%360;
  if(!hues.some(existing=>Math.abs(existing-hue)<10||Math.abs(existing-hue)>350))hues.push(hue);
 }
 return hues.slice(0,total).map((hue,index)=>{
  const lightness=index%3===0?62:index%3===1?55:68;
  return `hsl(${hue.toFixed(1)} 72% ${lightness}%)`;
 });
}
function renderAllocationChart(){
 const rows=(state.itens||[]).filter(item=>Number(item.valor_atual||0)>0);
 const selectedType=document.getElementById('allocationType')?.value||'todos';
 let entries=[];
 if(selectedType==='todos'){
  const grouped={};
  rows.forEach(item=>{
   const key=item.tipo||'outros';
   if(!grouped[key])grouped[key]={name:labels[key]||key,value:0,type:key};
   grouped[key].value+=Number(item.valor_atual||0);
  });
  entries=Object.values(grouped).sort((a,b)=>b.value-a.value);
 }else{
  entries=rows.filter(item=>item.tipo===selectedType)
   .sort((a,b)=>Number(b.valor_atual||0)-Number(a.valor_atual||0))
   .map(item=>({name:item.ticker,value:Number(item.valor_atual||0),type:item.tipo,ticker:item.ticker}));
 }
 const names=entries.map(item=>item.name),values=entries.map(item=>item.value);
 const denominator=values.reduce((sum,value)=>sum+value,0);
 const colors=getDistinctChartColors(entries.length);
 entries.forEach((item,index)=>item.color=colors[index]);
 chart('allocationChart','doughnut',{labels:names,datasets:[{data:values,backgroundColor:colors,borderWidth:0,hoverOffset:5}]},{cutout:'66%',plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${pct(denominator?Number(ctx.raw||0)/denominator*100:0)} · ${brl(ctx.raw||0)}`}}}});
 const legend=document.getElementById('allocationLegend');
 if(legend){
  legend.innerHTML=entries.length?entries.map((item,index)=>{
   const share=denominator?item.value/denominator*100:0;
   const sublabel=selectedType==='todos'?'Classe de ativo':(labels[item.type]||item.type);
   return `<div class="allocation-legend-row"><span class="allocation-dot" style="background:${colors[index]}"></span><span class="allocation-legend-name"><b>${escapeHTML(item.name)}</b><small>${escapeHTML(sublabel)}</small></span><strong>${pct(share)}</strong></div>`;
  }).join(''):'<div class="empty">Nenhum ativo lançado nesta categoria.</div>';
 }
}
function syncLaunchTypeFilter(){
 const select=document.getElementById('launchType');
 if(!select)return;
 const defs=[['acao','Ações'],['fii','FIIs'],['bdr','BDRs'],['etf','ETFs'],['internacional','ETFs Internacionais'],['renda_fixa','Renda Fixa'],['stocks','Stocks'],['reit','REITs'],['cripto','Criptomoedas'],['tesouro','Tesouro Direto'],['fundo','Fundos de Investimentos'],['outros','Outros']];
 const active=new Set((state.itens||[]).map(item=>item.tipo));
 const previous=select.value||'todos';
 const opts=[['todos','Todos os tipos'],...defs.filter(([key])=>active.has(key))];
 select.innerHTML=opts.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
 select.value=opts.some(([v])=>v===previous)?previous:'todos';
}
function renderLaunchConsolidation(){
 const granularity=document.getElementById('launchGranularity')?.value||'mensal';
 const period=document.getElementById('launchPeriod')?.value||'24';
 const type=document.getElementById('launchType')?.value||'todos';
 const operations=(state.operacoes||[]).filter(op=>type==='todos'||op.tipo===type);
 const valid=operations.map(op=>({...op,_date:String(op.data_execucao||op.data||'').slice(0,10)})).filter(op=>/^\d{4}-\d{2}-\d{2}$/.test(op._date));
 const now=new Date(),current=new Date(now.getFullYear(),now.getMonth(),1);
 let cutoff=null;
 if(period!=='all'){cutoff=new Date(current.getFullYear(),current.getMonth()-Number(period)+1,1);}
 const buckets={};
 valid.forEach(op=>{
  const d=new Date(op._date+'T12:00:00');
  if(cutoff&&d<cutoff)return;
  let key;
  if(granularity==='anual')key=String(d.getFullYear());
  else if(granularity==='trimestral')key=`${d.getFullYear()}-T${Math.floor(d.getMonth()/3)+1}`;
  else key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  if(!buckets[key])buckets[key]={compras:0,vendas:0};
  const amount=Number(op.quantidade||0)*Number(op.preco||0)+Number(op.custos||0);
  if(op.lado==='venda')buckets[key].vendas+=Math.max(0,amount-2*Number(op.custos||0));
  else buckets[key].compras+=amount;
 });
 const keys=Object.keys(buckets).sort();
 const fmt=k=>granularity==='anual'?k:granularity==='trimestral'?`${k.slice(0,4)} · ${k.slice(5)}`:`${k.slice(5,7)}/${k.slice(0,4)}`;
 const labels=keys.map(fmt),buys=keys.map(k=>Number(buckets[k].compras.toFixed(2))),sells=keys.map(k=>Number(buckets[k].vendas.toFixed(2)));
 chart('launchConsolidationChart','bar',{labels,datasets:[{label:'Compras',data:buys,backgroundColor:'#31b77e',borderRadius:4},{label:'Vendas',data:sells.map(v=>-v),backgroundColor:'#ef6680',borderRadius:4}]},{plugins:{legend:{labels:{color:'#b8c1ce'}}},scales:{x:{ticks:{color:'#8f99a8'},grid:{display:false}},y:{ticks:{color:'#8f99a8',callback:v=>'R$ '+Math.abs(Number(v)).toLocaleString('pt-BR')},grid:{color:'#303541'}}}});
 const totalBuys=buys.reduce((a,b)=>a+b,0),totalSells=sells.reduce((a,b)=>a+b,0);
 const totalEl=document.getElementById('launchConsolidationTotal');
 if(totalEl)totalEl.textContent=`Compras ${brl(totalBuys)} · Vendas ${brl(totalSells)} · Líquido ${brl(totalBuys-totalSells)}`;
 const tbody=document.getElementById('launchConsolidationRows');
 if(tbody)tbody.innerHTML=keys.length?keys.slice().reverse().map(k=>`<tr><td>${fmt(k)}</td><td class="green">${brl(buckets[k].compras)}</td><td class="red">${brl(buckets[k].vendas)}</td><td class="${buckets[k].compras-buckets[k].vendas>=0?'green':'red'}">${brl(buckets[k].compras-buckets[k].vendas)}</td></tr>`).join(''):rowEmpty(4,'Não há lançamentos executados no período selecionado.');
}
function renderPatrimonyDashboard(){
 const items=(state.itens||[]).filter(item=>String(item.ticker||'').trim());
 const byType={};
 items.forEach(item=>{const key=item.tipo||'outros';(byType[key]??=[]).push(item);});
 const classes=Object.keys(byType);
 const classValues=classes.map(k=>byType[k].reduce((s,item)=>s+Number(item.valor_atual||item.investido||0),0));
 const total=classValues.reduce((a,b)=>a+b,0);
 const names=classes.map(k=>labels[k]||k);
 const classColors=getDistinctChartColors(classes.length);
 chart('patrimonyChart','doughnut',{labels:names,datasets:[{data:classValues,backgroundColor:classColors,borderWidth:0,hoverOffset:4}]},{cutout:'66%',plugins:{legend:{display:false}}});
 const list=document.getElementById('allocationList');
 if(list)list.innerHTML=classes.length?classes.map((key,i)=>{const share=total?classValues[i]/total*100:0;return `<div class="patrimony-class-row"><b>${escapeHTML(labels[key]||key)}</b><strong>${brl(classValues[i])} · ${pct(share)}</strong><div class="bar"><span style="width:${share}%;background:${classColors[i]}"></span></div></div>`}).join(''):'<div class="empty">Sem posições cadastradas.</div>';
 const host=document.getElementById('patrimonyCategoryBreakdown');
 if(!host)return;
 host.innerHTML=classes.map((key,index)=>{
  const group=byType[key].slice().sort((a,b)=>Number(b.valor_atual||0)-Number(a.valor_atual||0));
  const groupTotal=group.reduce((s,item)=>s+Number(item.valor_atual||item.investido||0),0);
  const canvasId='patrimonyClass_'+String(key).replace(/[^a-z0-9]/gi,'_');
  const assetColors=getDistinctChartColors(group.length);
  const legend=group.map((item,itemIndex)=>{const value=Number(item.valor_atual||item.investido||0),share=groupTotal?value/groupTotal*100:0;return `<div class="patrimony-asset-row"><b>${escapeHTML(item.ticker)}</b><strong>${brl(value)}</strong><div class="bar"><span style="width:${share}%;background:${assetColors[itemIndex]}"></span></div></div>`}).join('');
  return `<div class="panel patrimony-category-card"><div class="panelhead"><h2>${escapeHTML(labels[key]||key)}</h2><span class="mini">${group.length} ativo(s) · ${brl(groupTotal)}</span></div><div class="patrimony-category-content"><div class="chartbox patrimony-category-chart"><canvas id="${canvasId}"></canvas></div><div class="patrimony-asset-list">${legend}</div></div></div>`;
 }).join('');
 classes.forEach((key,index)=>{
  const group=byType[key].slice().sort((a,b)=>Number(b.valor_atual||0)-Number(a.valor_atual||0));
  const canvasId='patrimonyClass_'+String(key).replace(/[^a-z0-9]/gi,'_');
  const assetColors=getDistinctChartColors(group.length);
  chart(canvasId,'doughnut',{labels:group.map(item=>item.ticker),datasets:[{data:group.map(item=>Number(item.valor_atual||item.investido||0)),backgroundColor:assetColors,borderWidth:0,hoverOffset:4}]},{cutout:'64%',plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${brl(ctx.raw||0)}`}}}});
 });
}
let returnPageInitialized=false;
function getReturnPerformance(){
 const selected=document.getElementById('returnTypeFilter')?.value||'todos';
 return selected==='todos'?(state.rentabilidade_historica||{}):(state.rentabilidade_por_tipo||{})[selected]||{};
}
function returnMonthlyRows(performance){
 const cumulative=Array.isArray(performance.series_total)?performance.series_total:[];
 const rows=[];let previousFactor=1;
 cumulative.forEach(point=>{
  const currentFactor=1+Number(point.valor||0)/100;
  const monthlyFactor=previousFactor>0?currentFactor/previousFactor:1;
  const [year,month]=String(point.mes||'').split('-').map(Number);
  if(year&&month>=1&&month<=12)rows.push({year,month,monthly:(monthlyFactor-1)*100,cumulative:Number(point.valor||0)});
  previousFactor=currentFactor;
 });
 return rows;
}

const RETURN_BENCHMARKS = ['CDI','IPCA','IFIX','IBOV','SMLL','IDIV','IVVB11'];
const RETURN_BENCHMARK_COLORS = {CDI:'#f5bd45',IPCA:'#78c56b',IFIX:'#b0a0e8',IBOV:'#ed6b75',SMLL:'#e2a16b',IDIV:'#48b9ae',IVVB11:'#5bb8d8'};
let returnBenchmarkData = null;
let returnBenchmarkPromise = null;
let returnVisibleSeries = new Set(['portfolio']);
let returnBenchmarkRequestKey = '';

function returnBenchmarkSelectHTML(cardKey){
 const saved=(()=>{try{const v=localStorage.getItem('lonelyWalletReturnBenchmark_'+cardKey)||'';return v==='CDI'?'':v}catch(e){return ''}})();
 return `<div class="return-benchmark-row"><label for="returnBenchmark_${cardKey}">Comparar com</label><select id="returnBenchmark_${cardKey}" class="return-benchmark-select" onchange="setReturnCardBenchmark('${cardKey}',this.value)"><option value="">Não comparar</option>${RETURN_BENCHMARKS.map(code=>`<option value="${code}" ${saved===code?'selected':''}>${code}</option>`).join('')}</select><small class="return-card-comparison" id="returnBenchmarkStatus_${cardKey}">Selecione um índice para comparar.</small></div>`;
}
function setReturnCardBenchmark(cardKey,value){
 if(!['total','12m','month'].includes(cardKey)||!(value===''||RETURN_BENCHMARKS.includes(value)))return;
 try{if(value)localStorage.setItem('lonelyWalletReturnBenchmark_'+cardKey,value);else localStorage.removeItem('lonelyWalletReturnBenchmark_'+cardKey)}catch(e){}
 updateReturnCardComparisons();
}
function toggleReturnSeries(code){
 if(code!=='portfolio'&&!RETURN_BENCHMARKS.includes(code))return;
 if(returnVisibleSeries.has(code))returnVisibleSeries.delete(code);else returnVisibleSeries.add(code);
 renderRentabilidadePage();
 if(code!=='portfolio'&&!returnIndexSeries(code).length){
  const note=document.getElementById('returnChartNote');
  if(note)note.textContent=`${code} foi selecionado, mas não há série histórica disponível para o período. A seleção continua ativa e será exibida quando a fonte responder.`;
 }
}
function returnIndexSeries(code){
 return returnBenchmarkData?.series?.[code]||[];
}
function benchmarkReturnFor(code,fromKey,toKey){
 const series=returnIndexSeries(code).slice().sort((a,b)=>a.mes.localeCompare(b.mes));
 if(!series.length||!fromKey||!toKey)return null;
 const eligible=series.filter(x=>x.mes<=toKey);
 const last=eligible[eligible.length-1];
 const previous=series.filter(x=>x.mes<fromKey).slice(-1)[0];
 const first=series.find(x=>x.mes>=fromKey&&x.mes<=toKey);
 if(!first||!last)return null;
 // Para séries de preços, o fechamento anterior é necessário para calcular o retorno do período.
 if(!previous&&!['CDI','IPCA'].includes(code))return null;
 const baseFactor=previous?1+Number(previous.valor)/100:1;
 const endFactor=1+Number(last.valor)/100;
 if(!(baseFactor>0)||!Number.isFinite(endFactor))return null;
 return (endFactor/baseFactor-1)*100;
}
function updateReturnCardComparisons(){
 const performance=getReturnPerformance(),monthly=returnMonthlyRows(performance);
 const now=new Date(),currentKey=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
 const completed=monthly.filter(row=>(row.year+'-'+String(row.month).padStart(2,'0'))<currentKey);
 const first=monthly[0]||null,lastCompleted=completed[completed.length-1]||null;
 const totalStart=first?first.year+'-'+String(first.month).padStart(2,'0'):null;
 const totalEnd=monthly.length?monthly[monthly.length-1].year+'-'+String(monthly[monthly.length-1].month).padStart(2,'0'):null;
 const monthKey=lastCompleted?lastCompleted.year+'-'+String(lastCompleted.month).padStart(2,'0'):null;
 const twelveRows=completed.slice(-12);
 const twelveContinuous=twelveRows.length===12&&twelveRows.every((row,index)=>index===0||(row.year*12+row.month)===(twelveRows[index-1].year*12+twelveRows[index-1].month+1));
 const twelveStart=twelveContinuous?twelveRows[0].year+'-'+String(twelveRows[0].month).padStart(2,'0'):null;
 const twelveEnd=twelveContinuous?twelveRows[11].year+'-'+String(twelveRows[11].month).padStart(2,'0'):null;
 const twelveFactor=twelveContinuous?twelveRows.reduce((factor,row)=>factor*(1+Number(row.monthly)/100),1):null;
 const portfolioTotal=performance.rentabilidade_total===null||performance.rentabilidade_total===undefined?null:Number(performance.rentabilidade_total);
 const portfolio12=twelveFactor===null?null:(twelveFactor-1)*100;
 const portfolioMonth=lastCompleted?Number(lastCompleted.monthly):null;
 const values={
  total:{start:totalStart,end:totalEnd,portfolio:portfolioTotal},
  '12m':{start:twelveStart,end:twelveEnd,portfolio:portfolio12},
  month:{start:monthKey,end:monthKey,portfolio:portfolioMonth}
 };
 for(const key of ['total','12m','month']){
  const select=document.getElementById('returnBenchmark_'+key),status=document.getElementById('returnBenchmarkStatus_'+key);
  if(!select||!status)continue;
  const code=select.value||'',range=values[key];
  if(!code){status.textContent='Comparação desativada.';continue;}
  const benchmark=range.portfolio===null||!range.start||!range.end?null:benchmarkReturnFor(code,range.start,range.end);
  if(benchmark===null||!Number.isFinite(benchmark)){
   const detail=returnBenchmarkData?.meta?.[code]?.last_available;
   status.textContent=range.portfolio===null
    ?(key==='12m'?'Ainda não há 12 meses fechados de histórico.':key==='month'?'Não há mês fechado com histórico suficiente.':'Histórico total da carteira indisponível.')
    :code+': série histórica indisponível para este período'+(detail?' · último dado '+detail:'')+'.';
  }else{
   const delta=range.portfolio-benchmark;
   status.textContent=code+': '+pct(benchmark)+' · Carteira '+Math.abs(delta).toFixed(2).replace('.',',')+' p.p. '+(delta>=0?'acima':'abaixo');
  }
 }
}
async function loadReturnBenchmarks(){
 const key='full-history';
 if(returnBenchmarkData&&returnBenchmarkRequestKey===key)return returnBenchmarkData;
 if(returnBenchmarkPromise&&returnBenchmarkRequestKey===key)return returnBenchmarkPromise;
 returnBenchmarkRequestKey=key;
 returnBenchmarkPromise=(async()=>{
  try{
   const response=await fetch('/api/benchmarks?start=1990-01-01',{cache:'no-store'});
   if(!response.ok)throw new Error('Não foi possível consultar os índices.');
   returnBenchmarkData=await response.json();
  }catch(error){returnBenchmarkData={series:{},unavailable:RETURN_BENCHMARKS.slice()};}
  finally{returnBenchmarkPromise=null;}
  return returnBenchmarkData;
 })();
 return returnBenchmarkPromise;
}
function renderRentabilidadePage(){
 const typeSelect=document.getElementById('returnTypeFilter');
 if(!typeSelect)return;
 const available=[...new Set((state.itens||[]).map(x=>String(x.tipo||'').toLowerCase()).filter(Boolean))].sort();
 const previous=typeSelect.value||'todos';
 typeSelect.innerHTML='<option value="todos">Todos os tipos</option>'+available.map(key=>`<option value="${escapeHTML(key)}">${escapeHTML(labels[key]||key)}</option>`).join('');
 typeSelect.value=available.includes(previous)?previous:'todos';
 const performance=getReturnPerformance();
 const monthly=returnMonthlyRows(performance);
 const period=document.getElementById('returnPeriodFilter')?.value||'all';
 const visible=period==='12'?monthly.slice(-12):monthly;
 const now=new Date(),currentKey=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
 const completed=monthly.filter(x=>(x.year+'-'+String(x.month).padStart(2,'0'))<currentKey);
 const lastComplete=completed[completed.length-1]||null;
 const last=lastComplete?Number(lastComplete.monthly):null;
 const twelveRows=completed.slice(-12);
 const twelveContinuous=twelveRows.length===12&&twelveRows.every((row,index)=>index===0||(row.year*12+row.month)===(twelveRows[index-1].year*12+twelveRows[index-1].month+1));
 const twelve=twelveContinuous?(twelveRows.reduce((factor,row)=>factor*(1+Number(row.monthly)/100),1)-1)*100:null;
 const summary=state.resumo||{};
 const investedTotal=Number(summary.investido||0);
 const consolidatedGain=Number(summary.lucro||0)+Number(summary.proventos||0);
 const total=investedTotal>0?(consolidatedGain/investedTotal)*100:null;
 const cards=document.getElementById('returnSummaryCards');
 if(cards)cards.innerHTML=`
  <div class="panel return-summary-card"><b>Últimos 12 meses</b><span>Rentabilidade</span><strong class="${twelve===null?'':twelve>=0?'green':'red'}">${twelve===null?'—':pct(twelve)+' '+(twelve>=0?'↗':'↘')}</strong><small>${twelve===null?'Exige 12 meses fechados de histórico':'Retorno composto dos 12 últimos meses fechados'}</small>${returnBenchmarkSelectHTML('12m')}</div>
  <div class="panel return-summary-card"><b>Último mês</b><span>Rentabilidade</span><strong class="${last===null?'':last>=0?'green':'red'}">${last===null?'—':pct(last)+' '+(last>=0?'↗':'↘')}</strong><small>${lastComplete?'Último mês fechado: '+String(lastComplete.month).padStart(2,'0')+'/'+lastComplete.year:'Histórico mensal indisponível'}</small>${returnBenchmarkSelectHTML('month')}</div>
  <div class="panel return-summary-card"><b>Rentabilidade total</b><span>Rentabilidade</span><strong class="${total===null?'':total>=0?'green':'red'}">${total===null?'—':pct(total)+' '+(total>=0?'↗':'↘')}</strong><small>Resultado consolidado sobre todo o valor investido: ${brl(consolidatedGain)}</small>${returnBenchmarkSelectHTML('total')}</div>
 `;
 const allTypesSelected=(typeSelect.value||'todos')==='todos';
 // Não comparar uma série parcial de alguns ativos com o retorno consolidado de toda a carteira.
 // Em Todos os tipos, o gráfico mostra o mesmo retorno atual do Resumo; a série mensal parcial
 // permanece disponível na tabela e nas visualizações por classe, sem ser rotulada como total.
 const historicalCapital=Array.isArray(performance.series_patrimonio)?performance.series_patrimonio:[];
 const portfolioRows=historicalCapital.filter(row=>row&&/^\\d{4}-\\d{2}$/.test(String(row.mes||'')));
 const cumulativeRows=Array.isArray(performance.series_total)?performance.series_total.filter(row=>row&&/^\\d{4}-\\d{2}$/.test(String(row.mes||''))):[];
 const chartRows=allTypesSelected
  ?(portfolioRows.length>1?portfolioRows:cumulativeRows)
  :visible.map(row=>({mes:row.year+'-'+String(row.month).padStart(2,'0'),retorno:row.cumulative}));
 const values=allTypesSelected
  ?chartRows.map(row=>portfolioRows.length>1
    ?Number((Number(row.aplicado||0)>0?(Number(row.ganho||0)/Number(row.aplicado||0))*100:0).toFixed(4))
    :Number(row.valor||0))
  :chartRows.map(row=>Number(row.retorno||0));
 const note=document.getElementById('returnChartNote');
 if(note){
  const activeSources=RETURN_BENCHMARKS.filter(code=>returnVisibleSeries.has(code)&&returnBenchmarkData?.meta?.[code]).map(code=>code+': '+returnBenchmarkData.meta[code].source+(returnBenchmarkData.meta[code].last_available?' · até '+returnBenchmarkData.meta[code].last_available:'')+(returnBenchmarkData.meta[code].sample?' · amostra de 30 pregões':''));
  const ipcaLast=returnBenchmarkData?.meta?.IPCA?.last_available;
  const ipcaInfo=ipcaLast?' IPCA disponível até '+ipcaLast+'; a competência atual só aparece após divulgação oficial.':'';
  const missingAssets=Array.isArray(performance.ativos_sem_historico)?performance.ativos_sem_historico:[];
  const coveredAssets=Number(performance.ativos_com_historico||0),assetTotal=Number(performance.total_ativos||0);
  const coverageText=(assetTotal?` Cobertura de histórico: ${coveredAssets}/${assetTotal} ativos.`:'')+(missingAssets.length?' Sem histórico: '+missingAssets.join(', ')+'.':'');
  note.textContent=allTypesSelected
   ?(chartRows.length?'A linha da carteira utiliza movimentações Pluggy/B3 e preços históricos disponíveis. Os índices são exibidos independentemente da cobertura histórica dos ativos. ':'Ainda não há histórico de preços suficiente para a carteira. Os índices são exibidos conforme a disponibilidade das fontes. ')+coverageText
   :'Série histórica da classe selecionada, calculada somente com os ativos que possuem histórico disponível. Dados ausentes não são interpolados.'+coverageText+ipcaInfo+(activeSources.length?' Fontes: '+activeSources.join(' | '):'');
 }
 // A ausência temporária de dados não deve bloquear a interação da legenda.
 const datasets=[];
 const benchmarkMonthSet=new Set();
 RETURN_BENCHMARKS.forEach(code=>returnIndexSeries(code).forEach(point=>{
  if(point&&/^\\d{4}-\\d{2}$/.test(String(point.mes||'')))benchmarkMonthSet.add(String(point.mes));
 }));
 const portfolioMonthSet=new Set(chartRows.map(row=>String(row.mes)));
 const chartMonths=allTypesSelected
  ?[...new Set([...benchmarkMonthSet,...portfolioMonthSet])].sort()
  :visible.map(x=>x.year+'-'+String(x.month).padStart(2,'0'));
 const chartLabels=chartMonths.length?chartMonths.map(key=>key.slice(5,7)+'/'+key.slice(2,4)):['Atual'];
 if(returnVisibleSeries.has('portfolio')){
  const portfolioMap=new Map(chartRows.map((row,index)=>[String(row.mes),values[index]]));
  const portfolioData=chartMonths.map(key=>portfolioMap.has(key)?portfolioMap.get(key):null);
  datasets.push({label:allTypesSelected?'Rentabilidade da carteira':'Rentabilidade da classe',data:portfolioData,borderColor:'#8da8ed',backgroundColor:'rgba(141,168,237,.12)',fill:false,tension:.22,pointRadius:2.5,pointHoverRadius:5,pointBackgroundColor:'#8da8ed',borderWidth:2,spanGaps:false});
 }
 RETURN_BENCHMARKS.forEach(code=>{
  if(!returnVisibleSeries.has(code))return;
  const series=returnIndexSeries(code);
  if(!series.length)return;
  const map=new Map(series.map(x=>[x.mes,Number(x.valor)]));
  const firstKey=chartMonths.find(key=>map.has(key))||'';
  const priorIndex=series.filter(x=>x.mes<firstKey).slice(-1)[0];
  const firstIndex=map.get(firstKey);
  const indexBase=priorIndex?1+Number(priorIndex.valor)/100:(Number.isFinite(firstIndex)?1+firstIndex/100:1);
  const data=chartMonths.map(key=>map.has(key)?Number((((1+map.get(key)/100)/indexBase-1)*100).toFixed(4)):null);
  if(data.some(x=>x!==null))datasets.push({label:code,data,borderColor:RETURN_BENCHMARK_COLORS[code],backgroundColor:'transparent',fill:false,tension:.18,pointRadius:2,pointHoverRadius:4,borderWidth:2,spanGaps:false});
 });
 const singleConsolidatedPoint=allTypesSelected&&chartMonths.length===1&&values.length===1;
 const singleValue=singleConsolidatedPoint?values[0]:null;
 const yAxis=singleConsolidatedPoint?{min:Math.floor((singleValue-1)*2)/2,max:Math.ceil((singleValue+1)*2)/2,ticks:{stepSize:.5,precision:1,color:'#aab3c2',callback:v=>`${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%`},grid:{color:'#383e49'}}:{ticks:{color:'#aab3c2',callback:v=>`${Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`},grid:{color:'#383e49'}};
 if(singleConsolidatedPoint&&datasets[0]){datasets[0].pointRadius=6;datasets[0].pointHoverRadius=8;datasets[0].fill=false;datasets[0].tension=0;}
 chart('returnPerformanceChart','line',{labels:chartLabels,datasets},{plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${pct(ctx.raw)}`}}},interaction:{mode:'index',intersect:false},scales:{x:{ticks:{color:'#aab3c2',maxRotation:0,autoSkip:true},grid:{display:false}},y:yAxis}});
 const chartTitle=document.querySelector('.return-investor-head h2');
 if(chartTitle)chartTitle.textContent=allTypesSelected?'Rentabilidade consolidada da carteira':'Rentabilidade da classe comparada com índices';
 const legend=document.getElementById('returnChartLegend');
 if(legend)legend.querySelectorAll('button[data-series]').forEach(button=>{
  const active=returnVisibleSeries.has(button.dataset.series);
  button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  const code=button.dataset.series;
  const availableSeries=code==='portfolio'||returnIndexSeries(code).length>0;
  const meta=returnBenchmarkData?.meta?.[code];
  button.title=code==='portfolio'?'Clique para exibir ou ocultar a rentabilidade da carteira':meta?'Fonte: '+meta.source+' · último dado: '+(meta.last_available||'indisponível')+(meta.sample?' · amostra recente':''):availableSeries?'Clique para exibir ou ocultar esta série':'Sem dados históricos disponíveis no momento; clique para exibir quando a fonte responder';
  button.disabled=false;button.setAttribute('aria-disabled','false');
  if(allTypesSelected&&code!=='portfolio'&&!chartRows.length)button.title='Aguardando histórico da carteira para alinhar o período da comparação.';
 });
 const yearGroups=new Map();
 monthly.forEach(row=>{if(!yearGroups.has(row.year))yearGroups.set(row.year,[]);yearGroups.get(row.year).push(row);});
 const tbody=document.getElementById('returnMonthlyRows');
 if(tbody){
  const years=[...yearGroups.keys()].sort((a,b)=>b-a);
  tbody.innerHTML=years.length?years.map(year=>{
   const entries=yearGroups.get(year),byMonth=new Map(entries.map(x=>[x.month,x]));
   const annualFactor=entries.reduce((factor,x)=>factor*(1+x.monthly/100),1),annual=(annualFactor-1)*100;
   const lastEntry=entries[entries.length-1];
   const cells=Array.from({length:12},(_,index)=>{const item=byMonth.get(index+1);return item?`<td class="${item.monthly>=0?'return-positive':'return-negative'}">${pct(item.monthly)}</td>`:'<td class="return-empty-cell">-</td>';}).join('');
   return `<tr><td>${year}</td>${cells}<td class="${annual>=0?'return-positive':'return-negative'}">${pct(annual)}</td><td class="${lastEntry.cumulative>=0?'return-positive':'return-negative'}">${pct(lastEntry.cumulative)}</td></tr>`;
  }).join(''):rowEmpty(15,'Ainda não há histórico mensal suficiente para montar a tabela.');
 }
 const tableNote=document.getElementById('returnTableNote');
 if(tableNote)tableNote.textContent=typeSelect.value==='todos'?'Retornos mensais calculados a partir dos ativos com histórico de preços disponível; o indicador total considera o resultado consolidado de toda a carteira.':'Retornos mensais da classe selecionada.';
 updateReturnCardComparisons();
 if(!returnBenchmarkData&&!returnBenchmarkPromise){
  loadReturnBenchmarks().then(()=>{if(document.getElementById('page-rentabilidade')&&!document.getElementById('page-rentabilidade').classList.contains('hidden'))renderRentabilidadePage();});
 }
}


function renderReturnPerformanceChart(items){
 const sorted=(items||[]).slice().sort((a,b)=>Number(b.lucro_pct||0)-Number(a.lucro_pct||0));
 const values=sorted.map(item=>Number(item.lucro_pct||0));
 chart('returnPerformanceChart','line',{labels:sorted.map(item=>item.ticker),datasets:[{label:'Rentabilidade atual',data:values,borderColor:'#78b7f5',backgroundColor:'rgba(120,183,245,.12)',fill:true,tension:.3,pointRadius:4,pointBackgroundColor:values.map(v=>v>=0?'#20bd82':'#ef6680'),segment:{borderColor:ctx=>(ctx.p0.parsed.y+ctx.p1.parsed.y)/2>=0?'#20bd82':'#ef6680'}}]},{plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>pct(ctx.raw)}}},scales:{x:{ticks:{color:'#8f99a8'},grid:{display:false}},y:{ticks:{color:'#8f99a8',callback:v=>`${Number(v).toLocaleString('pt-BR')}%`},grid:{color:'#303541'}}}});
}

function renderReturnSparklines(series12m,seriesTotal,totalFallback){
 const draw=(id,series,emptyText)=>{
  const svg=document.getElementById(id);if(!svg)return;
  const parent=svg.parentElement;
  const rows=(Array.isArray(series)?series:[]).filter(item=>item&&/^\\d{4}-\\d{2}$/.test(String(item.mes||''))&&Number.isFinite(Number(item.valor)));
  const values=rows.map(item=>Number(item.valor));
  if(!values.length){
   svg.innerHTML='';
   if(parent){parent.classList.add('spark-empty');parent.dataset.empty=emptyText||'Histórico indisponível';}
   return;
  }
  if(parent){parent.classList.remove('spark-empty');delete parent.dataset.empty;}
  const width=300,height=40,pad=4;
  const min=Math.min(0,...values),max=Math.max(0,...values),span=Math.max(max-min,0.2);
  const y=value=>Number((height-pad-((value-min)/span)*(height-pad*2)).toFixed(2));
  const points=values.map((value,index)=>[Number((index/(Math.max(1,values.length-1))*width).toFixed(2)),y(value)]);
  let path='';
  if(points.length===1){path=`M ${points[0][0]} ${points[0][1]} L ${points[0][0]+1} ${points[0][1]}`;}
  else{
   path=`M ${points[0][0]} ${points[0][1]}`;
   for(let i=0;i<points.length-1;i++){
    const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];
    const cp1x=p1[0]+(p2[0]-p0[0])/6,cp1y=p1[1]+(p2[1]-p0[1])/6;
    const cp2x=p2[0]-(p3[0]-p1[0])/6,cp2y=p2[1]-(p3[1]-p1[1])/6;
    path+=` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0]} ${p2[1]}`;
   }
  }
  const color=values[values.length-1]>=0?'#20bd82':'#ef6680';
  const baseline=y(0);
  const title=rows.map(row=>{const [year,month]=row.mes.split('-');return `${month}/${year}: ${pct(Number(row.valor))}`;}).join(' | ');
  svg.innerHTML=`<title>${escapeHTML(title)}</title><line x1="0" y1="${baseline}" x2="${width}" y2="${baseline}" stroke="#596273" stroke-opacity=".32" stroke-width="1" stroke-dasharray="2 5"></line><path d="${path}" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>`;
 };
 draw('return12mChart',series12m,'Histórico de 12 meses indisponível');
 draw('returnTotalChart',seriesTotal,'Histórico total indisponível');
}

function renderConsolidatedReturnSparklines(value){
 const performance=state.rentabilidade_historica||{};
 const valid=rows=>Array.isArray(rows)?rows.filter(point=>point&&/^\d{4}-\d{2}$/.test(String(point.mes||''))&&Number.isFinite(Number(point.valor))):[];
 const totalSeries=valid(performance.series_roi_total||performance.series_total);
 const twelveMonths=valid(performance.series_12m).slice(-12);
 renderReturnSparklines(twelveMonths,totalSeries,null);
}

function operationQuantity(value){
 const n=Number(value||0);
 return n.toLocaleString('pt-BR',{maximumFractionDigits:8});
}
function setOperationGroupPage(encodedKey,page){
 const key=decodeURIComponent(encodedKey);
 const rows=operationGroupsData.filter(op=>String(op.tipo||'outros').toLowerCase()===key);
 const totalPages=Math.max(1,Math.ceil(rows.length/OPERATION_GROUP_PAGE_SIZE));
 operationGroupPages[key]=Math.min(Math.max(1,Number(page)||1),totalPages);
 renderOperationsByType(operationGroupsData);
}
function operationGroupPagination(key,totalPages,currentPage){
 if(totalPages<=1)return '';
 const encoded=encodeURIComponent(key);
 const pages=new Set([1,totalPages]);
 for(let n=Math.max(1,currentPage-1);n<=Math.min(totalPages,currentPage+1);n++)pages.add(n);
 const ordered=[...pages].sort((a,b)=>a-b);let previous=0;
 const pageButtons=ordered.map(n=>{
  const gap=previous&&n-previous>1?'<span class="page-info">…</span>':'';previous=n;
  return gap+`<button type="button" class="${n===currentPage?'active':''}" ${n===currentPage?'aria-current="page"':''} onclick="setOperationGroupPage('${encoded}',${n})">${n}</button>`;
 }).join('');
 return `<nav class="operation-group-pagination" aria-label="Paginação dos lançamentos de ${escapeHTML(labels[key]||key)}"><button type="button" ${currentPage===1?'disabled':''} onclick="setOperationGroupPage('${encoded}',${currentPage-1})">Anterior</button>${pageButtons}<button type="button" ${currentPage===totalPages?'disabled':''} onclick="setOperationGroupPage('${encoded}',${currentPage+1})">Próximo</button><span class="page-info">${rowsCountLabel(totalPages,currentPage)}</span></nav>`;
}
function rowsCountLabel(totalPages,currentPage){return `Página ${currentPage} de ${totalPages}`;}
function renderOperationsByType(allOps){
 const host=document.getElementById('operationGroups');
 if(!host)return;
 operationGroupsData=Array.isArray(allOps)?allOps.slice():[];
 const order=['acao','fii','etf','bdr','internacional','stocks','reit','cripto','renda_fixa','tesouro','outros'];
 const groups=new Map();
 operationGroupsData.forEach(op=>{
  const key=String(op.tipo||'outros').toLowerCase();
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(op);
 });
 const keys=[...groups.keys()].sort((a,b)=>{
  const ai=order.indexOf(a),bi=order.indexOf(b);
  return (ai<0?999:ai)-(bi<0?999:bi) || (labels[a]||a).localeCompare(labels[b]||b,'pt-BR');
 });
 if(!keys.length){host.innerHTML='<div class="empty">Nenhum lançamento cadastrado.</div>';return;}
 host.innerHTML=keys.map(key=>{
  const rows=groups.get(key).sort((a,b)=>String(b.data_execucao||b.data).localeCompare(String(a.data_execucao||a.data)));
  const buys=rows.filter(x=>x.lado==='compra').reduce((sum,x)=>sum+Number(x.quantidade||0)*Number(x.preco||0)+Number(x.custos||0),0);
  const sells=rows.filter(x=>x.lado==='venda').reduce((sum,x)=>sum+Number(x.quantidade||0)*Number(x.preco||0)-Number(x.custos||0),0);
  const totalPages=Math.max(1,Math.ceil(rows.length/OPERATION_GROUP_PAGE_SIZE));
  const currentPage=Math.min(Math.max(1,Number(operationGroupPages[key])||1),totalPages);
  operationGroupPages[key]=currentPage;
  const visibleRows=rows.slice((currentPage-1)*OPERATION_GROUP_PAGE_SIZE,currentPage*OPERATION_GROUP_PAGE_SIZE);
  return `<section class="operation-group"><div class="operation-group-head"><div><div class="operation-group-title">${escapeHTML(labels[key]||key)} <span class="operation-group-count">${rows.length} lançamento(s)</span></div></div><div class="operation-group-totals"><span>Compras <b class="green">${brl(buys)}</b></span><span>Vendas <b class="red">${brl(sells)}</b></span><span>Saldo líquido <b>${brl(buys-sells)}</b></span></div></div><div class="tablewrap"><table class="data"><thead><tr><th>Execução / agendamento</th><th>Ativo</th><th>Operação</th><th>Quantidade</th><th>Preço unitário</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${visibleRows.map(o=>{
   const when=o.data_execucao?new Date(o.data_execucao).toLocaleString('pt-BR'):(o.data||'');
   const metadata=(()=>{try{return typeof o.detalhes==='string'?JSON.parse(o.detalhes||'{}'):(o.detalhes||{})}catch{return {}}})();
   const details=metadata.descricao||metadata.observacoes||'';
   const source=metadata.origem==='Pluggy'?' · Pluggy':metadata.origem==='Importação B3'?' · B3':'';
   const total=Number(o.quantidade||0)*Number(o.preco||0)+Number(o.custos||0);
   const locked=metadata.origem==='Pluggy';
   return `<tr><td>${escapeHTML(when)}</td><td class="ticker">${escapeHTML(o.ticker)}${source?`<div class="mini">Origem${escapeHTML(source)}</div>`:''}${details?`<div class="mini">${escapeHTML(details)}</div>`:''}</td><td class="${o.lado==='compra'?'green':'red'}">${o.lado==='compra'?'Compra':'Venda'}</td><td>${operationQuantity(o.quantidade)}</td><td>${brl(o.preco)}</td><td>${brl(total)}</td><td>${o.status==='agendada'?'<span class="tag">Agendada</span>':'<span class="tag">Executada</span>'}</td><td>${locked?'<span class="tag" title="Importado pela Pluggy e protegido contra alterações">Somente leitura</span>':`<div class="prov-edit-actions"><button class="ghost" type="button" onclick="editOperation(${Number(o.id)})">Editar lançamento</button><button class="ghost" type="button" onclick="removeOperation(${Number(o.id)})">Excluir</button></div>`}</td></tr>`;
  }).join('')}</tbody></table></div>${operationGroupPagination(key,totalPages,currentPage)}</section>`;
 }).join('');
}
function renderImportedBalances(rows,baseDate){
 const host=document.getElementById('importedBalanceGroups');
 const dateLabel=document.getElementById('importedBalancesDate');
 if(!host)return;
 if(dateLabel)dateLabel.textContent=baseDate?`Data-base: ${new Date(baseDate+'T12:00:00').toLocaleDateString('pt-BR')}`:'Sem posição importada';
 const active=(rows||[]).filter(x=>Number(x.quantidade||0)>1e-8);
 if(!active.length){host.innerHTML='<div class="empty">Nenhuma posição-base importada.</div>';return;}
 const order=['acao','fii','etf','bdr','internacional','stocks','reit','cripto','renda_fixa','tesouro','outros'];
 const groups=new Map();
 active.forEach(item=>{const key=String(item.tipo||'outros').toLowerCase();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
 const keys=[...groups.keys()].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
 host.innerHTML=keys.map(key=>{
  const items=groups.get(key).sort((a,b)=>String(a.ticker).localeCompare(String(b.ticker),'pt-BR'));
  const total=items.reduce((sum,x)=>sum+Number(x.quantidade||0)*Number(x.preco_base||0),0);
  const isFixed=key==='renda_fixa';
  return `<section class="imported-balance-class"><div class="imported-balance-head"><strong>${escapeHTML(labels[key]||key)} · ${items.length} ativo(s)</strong><span class="imported-balance-total">Valor na captura: ${brl(total)}</span></div><div class="tablewrap"><table class="data"><thead><tr><th>Ativo / aplicação</th><th>Quantidade</th><th>${isFixed?'Custo estimado':'Preço médio'}</th><th>${isFixed?'Saldo na captura':'Preço de referência'}</th><th>Valor total na captura</th></tr></thead><tbody>${items.map(x=>{
   const qty=Number(x.quantidade||0),avg=Number(x.preco_medio||0),base=Number(x.preco_base||0);
   return `<tr><td class="ticker">${escapeHTML(x.nome||x.ticker)}<div class="mini">${escapeHTML(x.ticker)}</div></td><td>${isFixed?'1 aplicação':operationQuantity(qty)}</td><td>${brl(avg)}</td><td>${brl(base)}</td><td>${brl(qty*base)}</td></tr>`;
  }).join('')}</tbody></table></div></section>`;
 }).join('');
}

function render(){const r=state.resumo||{},provDash=state.proventos_dashboard||{};
const totalProfit=Number(r.lucro||0)+Number(r.proventos||0);
const performance=state.rentabilidade_historica||{};
const return12m=performance.rentabilidade_12m;
const returnTotal=performance.rentabilidade_total;
const portfolioReturn=returnTotal===null||returnTotal===undefined?null:Number(returnTotal);
document.getElementById('stats').innerHTML=`
 <div class="card stat"><div class="statlabel-row">Patrimônio total<span class="info-tip" tabindex="0" aria-label="Sobre o patrimônio total" data-tip="Valor atual de todos os seus ativos na carteira, considerando a cotação atual de cada posição.">i</span></div><div class="statvalue statvalue-inline">${brl(r.atual||0)} <small class="${totalProfit>=0?'green':'red'}" title="Resultado total de ${brl(totalProfit)} sobre ${brl(r.investido||0)} investidos">${pct(portfolioReturn)} ${totalProfit>=0?'▲':'▼'}</small></div><div class="statdetail"><span>Valor investido</span><b>${brl(r.investido||0)}</b></div></div>
 <div class="card stat"><div class="statlabel-row">Lucro total<span class="info-tip" tabindex="0" aria-label="Sobre o lucro total" data-tip="Seu resultado acumulado na carteira: ganho de capital (valorização dos ativos) somado aos dividendos e proventos recebidos.">i</span></div><div class="statvalue ${totalProfit>=0?'green':'red'}">${brl(totalProfit)}</div><div class="statdetail"><span>Ganho de capital</span><b>${brl(r.lucro||0)}</b></div><div class="statdetail"><span>Dividendos recebidos</span><b>${brl(r.proventos||0)}</b></div></div>
 <div class="card stat"><div class="statlabel-row">Proventos recebidos (12M)<span class="info-tip" tabindex="0" aria-label="Sobre os proventos recebidos" data-tip="Total de dividendos, JCP e rendimentos recebidos nos últimos 12 meses.">i</span></div><div class="statvalue">${brl(provDash.total_12m||0)}</div><div class="statdetail"><span>Total confirmado</span><b>${brl(provDash.total_12m||0)}</b></div></div>
 <div class="card stat return-stat-card"><div class="statlabel-row">Rentabilidade<span class="info-tip" tabindex="0" aria-label="Sobre o cálculo da rentabilidade" data-tip="Rentabilidade calculada mês a mês pelo método Modified Dietz, ponderando aportes e retiradas pelo tempo em que permaneceram na carteira. O cálculo usa o patrimônio histórico e considera proventos sem duplicá-los quando já estão incorporados aos preços ajustados. O período de 12 meses só é exibido quando há 12 meses calculáveis.">i</span></div><div class="return-spark-grid"><div class="return-spark-item"><span>Últimos 12 meses</span><svg id="return12mChart" class="sparkline-svg" viewBox="0 0 300 40" role="img" aria-label="Rentabilidade dos últimos 12 meses"></svg><b class="${return12m===null||return12m===undefined?'':Number(return12m)>=0?'green':'red'}">${return12m===null||return12m===undefined?'Indisponível':pct(return12m)}</b></div><div class="return-spark-item"><span>Total</span><svg id="returnTotalChart" class="sparkline-svg" viewBox="0 0 300 40" role="img" aria-label="Rentabilidade total"></svg><b class="${portfolioReturn===null?'':portfolioReturn>=0?'green':'red'}">${portfolioReturn===null?'Indisponível':pct(portfolioReturn)}</b></div></div></div>`;
renderConsolidatedReturnSparklines(portfolioReturn);


const rows=state.itens||[];
const countNode=document.getElementById('summaryAssetCount');
if(countNode)countNode.textContent=`(${rows.length})`;
renderPositionInsights(rows);
renderPositionGroups(rows,'summaryGroups',true);

syncDashboardCategoryFilters();renderEvolutionChart();renderAllocationChart();syncLaunchTypeFilter();renderLaunchConsolidation();renderEvolutionChart('patrimonyEvolutionChart','patrimonyPeriod','patrimonyType');renderPatrimonyDashboard();
renderProventosDashboard();
const allOps=[...(state.operacoes||[]),...(state.agendadas||[])].sort((a,b)=>String(b.data_execucao||b.data).localeCompare(String(a.data_execucao||a.data)));renderOperationsByType(allOps);
renderRentabilidadePage();

document.getElementById('goalRows').innerHTML=(state.metas||[]).length?state.metas.map(m=>{
 let current=0,currentLabel='Patrimônio atual';
 const target=Number(m.objetivo||0),monthly=Number(m.aporte||0),annual=Number(m.variacao_anual||0);
 if(m.tipo==='proventos'){
  currentLabel='Média mensal recebida';let classes=[];try{classes=JSON.parse(m.classes||'[]')}catch(e){}
  const received=state.proventos_dashboard?.recebidos||[],cutoff=new Date();cutoff.setDate(1);cutoff.setMonth(cutoff.getMonth()-11);
  const sum=received.filter(x=>{const dt=new Date(String(x.data_pagamento||'')+'T12:00:00');const kind=x.tipo_ativo||((state.itens||[]).find(i=>i.ticker===x.ticker)||{}).tipo;return dt>=cutoff&&(!classes.length||classes.includes(kind))&&!String(x.tipo_evento||x.tipo||'').toUpperCase().includes('AMORTIZA');}).reduce((a,x)=>a+Number(x.valor_total||0),0);current=sum/12;
 }else if(m.tipo==='ativos'){
  currentLabel='Valor atual do ativo';const holding=(state.itens||[]).find(x=>x.ticker===m.ticker);current=Number(holding?.valor_atual??(Number(holding?.quantidade||0)*Number(holding?.preco_atual||holding?.preco_medio||0)));
 }else{
  const cat=m.categoria||'total';const aliases={acao:['acao'],fii:['fii'],etf:['etf'],internacional:['internacional'],renda_fixa:['renda_fixa'],stocks:['stocks'],bdr:['bdr'],cripto:['cripto'],tesouro:['tesouro'],fundo:['fundo'],outros:['outros']};
  if(cat==='total')current=Number(r.atual||0);else if(cat==='brasil')current=(state.itens||[]).filter(x=>x.tipo!=='internacional'&&x.tipo!=='stocks'&&x.tipo!=='reit').reduce((a,x)=>a+Number(x.investido||0),0);else if(cat==='exterior')current=(state.itens||[]).filter(x=>['internacional','stocks','reit'].includes(x.tipo)).reduce((a,x)=>a+Number(x.investido||0),0);else current=(state.itens||[]).filter(x=>(aliases[cat]||[cat]).includes(x.tipo)).reduce((a,x)=>a+Number(x.investido||0),0);
 }
 const progress=target>0?Math.max(0,Math.min(100,current/target*100)):0,remaining=Math.max(0,target-current);
 let months=null;if(monthly>0&&remaining>0){const rate=Math.pow(1+Math.max(-99,annual)/100,1/12)-1;let projected=current;months=0;while(projected<target&&months<1200){projected=projected*(1+rate)+monthly;months++;}if(months>=1200&&projected<target)months=null;}const eta=remaining<=0?'Concluída':months?new Date(new Date().getFullYear(),new Date().getMonth()+months,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}):'Não estimada';
 const title=m.nome||'Meta';const typeLabel=m.tipo==='proventos'?'Meta de Proventos':m.tipo==='ativos'?'Meta de Ativo':'Meta de Patrimônio';
 return `<div class="panel goal-dashboard-card"><div class="goalrow"><div class="goal-title"><span class="goal-icon">${m.tipo==='proventos'?'◉':m.tipo==='ativos'?'▣':'◎'}</span><span><small class="mini">${typeLabel}</small><br>${escapeHTML(title)}</span></div><button class="ghost" onclick="removeGoal(${m.id})">Excluir</button></div><div class="goal-progress-head"><strong>${pct(progress)}</strong><span>do objetivo alcançado</span></div><div class="progress"><span style="width:${progress}%"></span></div><div class="goal-dashboard-metrics"><div class="goal-dashboard-metric">${currentLabel}<b>${brl(current)}</b></div>${m.tipo!=='proventos'?`<div class="goal-dashboard-metric">Aporte mensal<b>${brl(monthly)}</b></div>`:''}<div class="goal-dashboard-metric">Faltam<b>${brl(remaining)}</b></div><div class="goal-dashboard-metric">Conclusão estimada<b>${eta}</b></div><div class="goal-dashboard-metric">Objetivo<b>${brl(target)}${m.tipo==='proventos'?'/mês':''}</b></div>${m.ticker?`<div class="goal-dashboard-metric">Ativo<b>${escapeHTML(m.ticker)}</b></div>`:''}${annual?`<div class="goal-dashboard-metric">Variação anual estimada<b>${pct(annual)}</b></div>`:''}</div></div>`;
 }).join(''):'<div class="panel empty">Você ainda não criou metas. Defina um objetivo para acompanhar seu progresso.</div>';
}
const API_PROVIDER_FALLBACK=[
 {id:'pluggy',name:'Pluggy',connected:false,category:'Open Finance · contas e investimentos',description:'Integração principal para conectar bancos e corretoras via Open Finance. Contas, posições e transações dependem dos produtos e dados disponibilizados por cada instituição.',auth:true,credentialType:'pluggy',url:'https://dashboard.pluggy.ai/',docs:'https://docs.pluggy.ai/'},
 {id:'brapi',name:'brapi',connected:true,category:'Brasil · cotações e histórico',description:'Ações, FIIs, BDRs, ETFs, índices cobertos, dividendos, fundos, Tesouro Direto e séries macroeconômicas. Cobertura e limites variam por plano.',auth:true,url:'https://brapi.dev/dashboard',docs:'https://brapi.dev/docs'},
 {id:'hgbrasil',name:'HG Brasil',connected:true,category:'Brasil · mercado e indicadores',description:'Cotações B3, índices, moedas, juros e dados históricos. Recursos históricos e cotações por ativo dependem do plano.',auth:true,url:'https://console.hgbrasil.com/',docs:'https://console.hgbrasil.com/documentation/finance'},
 {id:'twelvedata',name:'Twelve Data',category:'Global · cotações e séries',description:'Séries históricas, cotações, ETFs, fundos, ações globais, câmbio e cripto. Verifique a cobertura B3 e os créditos do plano.',auth:true,url:'https://twelvedata.com/account',docs:'https://twelvedata.com/docs'},
 {id:'alphavantage',name:'Alpha Vantage',category:'Global · cotações e fundamentos',description:'Séries históricas, ETFs, fundos, dividendos, câmbio e indicadores econômicos. Cobertura brasileira varia por endpoint.',auth:true,url:'https://www.alphavantage.co/support/#api-key',docs:'https://www.alphavantage.co/documentation/'},
 {id:'fred',name:'FRED',category:'Macroeconomia internacional',description:'Séries macroeconômicas e indicadores econômicos internacionais; não substitui preços de ativos B3.',auth:true,url:'https://fred.stlouisfed.org/docs/api/api_key.html',docs:'https://fred.stlouisfed.org/docs/api/fred/'},
 {id:'bcb',name:'Banco Central · SGS',connected:true,category:'Brasil · fonte oficial',description:'Séries oficiais como CDI, Selic, IPCA e outros indicadores. API pública sem token.',auth:false,url:'https://www.bcb.gov.br/gestao_site/webservices.asp',docs:'https://www.bcb.gov.br/estabilidadefinanceira/seriestemporais'},
 {id:'ibge',name:'IBGE · SIDRA',category:'Brasil · estatísticas e inflação',description:'Séries estatísticas oficiais, indicadores de preços e atividade econômica. API pública sem token; não fornece cotação de ativos.',auth:false,url:'https://servicodados.ibge.gov.br/api/docs/agregados?versao=3',docs:'https://apisidra.ibge.gov.br/'},
 {id:'tesouro',name:'Tesouro Transparente',category:'Brasil · títulos públicos',description:'Dados abertos de taxas e preços diários de títulos do Tesouro Direto e relatórios da dívida pública. Sem token.',auth:false,url:'https://www.tesourotransparente.gov.br/temas/divida-publica-federal/tesouro-direto',docs:'https://www.tesourotransparente.gov.br/ckan/dataset'},
 {id:'cvm',name:'CVM Dados Abertos',category:'Brasil · fundos e demonstrações',description:'Dados públicos de fundos, informes e demonstrações financeiras. Não é uma API de cotação em tempo real; não exige token.',auth:false,url:'https://dados.cvm.gov.br/',docs:'https://dados.cvm.gov.br/'},
 {id:'b3',name:'B3 · APIs oficiais',category:'Brasil · dados oficiais',description:'Posições, movimentações, eventos provisionados e negociação. Exige contratação/licença B2B e autorização do investidor.',auth:false,url:'https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/b3-for-developers/',docs:'https://developers.b3.com.br/apis'},
 {id:'yahoo',name:'Yahoo Finance',category:'Global · fonte complementar',description:'Histórico e cotações por endpoints não oficiais. Não há API pública oficial com garantia de disponibilidade ou licença comercial.',auth:false,url:'https://finance.yahoo.com/',docs:'https://finance.yahoo.com/'},
 {id:'dadosb3',name:'Dados B3 · Índices históricos',connected:true,category:'Brasil · índices de retorno total',description:'Séries diárias de IBOV, IFIX, SMLL e IDIV, com retorno total. Sem chave, a API libera apenas os últimos 30 pregões; a chave grátis libera a série completa (200 consultas/dia). Serviço independente que organiza dados públicos da B3, não é a API oficial da B3.',auth:true,url:'https://dadosb3.com/chave-gratis?de=api',docs:'https://dadosb3.com/api'}
];
let apiProviders=[];
async function loadAPIProviders(){
 const host=document.getElementById('apiProvidersGrid');if(!host)return;
 try{const data=await api('/api/integracoes',{skipAutoRefresh:true});apiProviders=data.providers||API_PROVIDER_FALLBACK;}
 catch(error){apiProviders=API_PROVIDER_FALLBACK.map(p=>({...p,configured:false,enabled:false,masked:''}));}
 renderAPIProviders();
 if(apiProviders.some(p=>p.id==='pluggy'&&p.configured&&p.enabled))loadPluggyState();
}
function renderAPIProviders(){
 const host=document.getElementById('apiProvidersGrid'),pluggyHost=document.getElementById('apiPluggyGrid');if(!host)return;
 const pluggy=apiProviders.filter(p=>p.id==='pluggy'),credentialed=apiProviders.filter(p=>p.auth&&p.id!=='pluggy');
 const card=p=>`<article class="panel api-provider-card ${p.id==='pluggy'?'api-pluggy':''}" data-api-provider="${p.id}">
  <div class="api-provider-head"><div><h3>${escapeHTML(p.name)}</h3><div class="api-provider-category">${escapeHTML(p.category||'')}</div></div><span class="api-status-pill ${p.configured&&p.enabled?'configured':p.configured?'warning':''}">${p.configured?(p.enabled?'Ativa · credenciais cadastradas':'Desativada · token preservado'):'Credenciais não configuradas'}</span></div>
  <div class="api-provider-desc">${escapeHTML(p.description||'')}</div>
  ${p.id==='pluggy'?`<div class="api-recommendation" role="note" style="padding:10px 12px;border:1px solid var(--blue);border-radius:8px;background:color-mix(in srgb,var(--blue) 9%,transparent);font-size:12px;line-height:1.5"><strong>Recomendação: altamente indicada.</strong> Mantenha a Pluggy configurada e sincronizada para obter a melhor cobertura possível de contas, posições, movimentações e proventos. A disponibilidade e a atualização dos dados dependem da instituição financeira e das permissões da conexão.</div><div class="mini">Open Finance. As credenciais são usadas exclusivamente no servidor; a vinculação de bancos e corretoras requer o fluxo Pluggy Connect.</div>
  <div class="api-credential-fields"><label class="mini" for="apiClientId_pluggy">Client ID<input type="text" id="apiClientId_pluggy" autocomplete="off" placeholder="${p.client_id_masked?'Cadastrado: '+p.client_id_masked:'Client ID da Pluggy'}"></label><label class="mini" for="apiClientSecret_pluggy">Client Secret<input type="password" id="apiClientSecret_pluggy" autocomplete="new-password" placeholder="${p.configured?'Cadastrado: ••••••••':'Client Secret da Pluggy'}"></label></div>
  <div class="api-provider-actions"><button class="primary" type="button" onclick="savePluggyCredentials()">Salvar credenciais</button><button class="ghost" type="button" onclick="testAPIProvider('pluggy')">Testar conexão</button>${p.configured?`<button class="ghost" type="button" onclick="toggleAPIProvider('pluggy',${!p.enabled})">${p.enabled?'Desativar':'Ativar'}</button><button class="ghost" type="button" onclick="deleteAPIProvider('pluggy')">Remover</button>`:''}</div>
  <div class="api-status" id="apiStatus_pluggy">${p.updated_at?'Última alteração: '+new Date(p.updated_at).toLocaleString('pt-BR'):''}</div>
  <div class="divider" style="margin:14px 0"></div><h4>Conexões MeuPluggy</h4>
  <div class="mini">No plano pessoal, conecte suas instituições no MeuPluggy e cadastre aqui o itemId de cada conexão.</div>
  <div class="api-credential-fields"><label class="mini">Nome da conexão<input id="pluggyItemLabel" type="text" placeholder="Ex.: Nubank"></label><label class="mini">itemId<input id="pluggyItemId" type="text" placeholder="Cole o itemId copiado do Dashboard"></label></div>
  <div class="api-provider-actions"><button class="primary" type="button" onclick="addPluggyItem()">Adicionar conexão</button><button class="ghost" type="button" onclick="syncPluggy()">Sincronizar tudo</button><a class="ghost pluggy-open-button" href="https://meu.pluggy.ai/" target="_blank" rel="noopener noreferrer">Abrir MeuPluggy ↗</a><button class="ghost" type="button" onclick="openPluggyManager()">Gerenciar API</button></div>
  <div id="pluggyState" class="pluggy-state mini">Carregando conexões…</div><div id="pluggyInvestments" class="pluggy-investments"></div>
  <div id="pluggyManageModal" class="pluggy-manager-overlay" style="display:none" onclick="if(event.target===this)closePluggyManager()">
   <div class="pluggy-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="pluggyManagerTitle">
    <div class="pluggy-manager-header"><div><h3 id="pluggyManagerTitle">Gerenciar API Pluggy</h3><div class="mini">Sincronização automática e exclusão de dados importados</div></div><button class="ghost" type="button" onclick="closePluggyManager()" aria-label="Fechar">✕</button></div>
    <div class="pluggy-manager-content">
     <label class="mini pluggy-auto-sync-control">Sincronizar automaticamente<select id="pluggyAutoSyncInterval" aria-label="Intervalo de sincronização automática" onchange="savePluggyAutoSyncInterval(this.value)"><option value="0">Desativado</option><option value="15">A cada 15 minutos</option><option value="30">A cada 30 minutos</option><option value="60">A cada hora</option><option value="240">A cada 4 horas</option><option value="720">A cada 12 horas</option><option value="1440">Uma vez ao dia</option></select></label>
     <div class="divider" style="margin:16px 0"></div><h4>Excluir dados importados</h4>
     <div class="mini">Escolha uma conexão específica ou todas as conexões para remover os dados importados.</div>
     <div class="api-provider-actions"><select id="pluggyClearItemSelect" aria-label="Conexão para limpar" style="max-width:240px"><option value="">Selecione a conexão</option><option value="__all__">Todas as conexões</option></select><button class="ghost danger" type="button" onclick="clearPluggyImportedData()">Limpar dados importados</button></div>
    </div>
   </div>
  </div>`:
  p.auth?`<div class="mini">${p.connected?'Conectada ao motor atual de dados':'Fonte complementar; cobertura depende do provedor e do plano.'}</div><label class="mini" for="apiToken_${p.id}">Token de integração</label><input type="password" id="apiToken_${p.id}" autocomplete="new-password" placeholder="${p.masked?'Cadastrado: '+p.masked:'Cole seu token aqui'}"/><div class="api-provider-actions"><button class="primary" type="button" onclick="saveAPIProvider('${p.id}')">Salvar token</button><button class="ghost" type="button" onclick="testAPIProvider('${p.id}')">Testar conexão</button>${p.configured?`<button class="ghost" type="button" onclick="toggleAPIProvider('${p.id}',${!p.enabled})">${p.enabled?'Desativar':'Ativar'}</button><button class="ghost" type="button" onclick="deleteAPIProvider('${p.id}')">Remover</button>`:''}</div>`:
  `<div class="api-provider-actions"><span class="mini">${p.id==='b3'?'Acesso mediante contrato e licença.':'Não é necessário cadastrar token.'}</span></div>`}
  <div class="api-status" id="apiStatus_${p.id}">${p.auth&&p.updated_at?'Última alteração: '+new Date(p.updated_at).toLocaleString('pt-BR'):''}</div>

  <div class="api-provider-links"><a href="${p.url}" target="_blank" rel="noopener noreferrer">Obter acesso</a><a href="${p.docs}" target="_blank" rel="noopener noreferrer">Documentação</a></div>
 </article>`;
 host.innerHTML=credentialed.map(card).join('');if(pluggyHost)pluggyHost.innerHTML=pluggy.map(card).join('')||'<div class="panel empty">Pluggy indisponível.</div>'; 
}

async function loadPluggyState(){
 const host=document.getElementById('pluggyState');if(!host)return;
 try{
  const data=await api('/api/pluggy/state',{skipAutoRefresh:true});
  window.pluggyConnections=data.items||[];
  const clearSelect=document.getElementById('pluggyClearItemSelect');if(clearSelect){const previous=clearSelect.value;clearSelect.innerHTML='<option value="">Selecione a conexão</option><option value="__all__">Todas as conexões</option>'+window.pluggyConnections.map(item=>`<option value="${escapeHTML(item.item_id)}">${escapeHTML(item.label||item.connector_name||'MeuPluggy')}</option>`).join('');if(previous==='__all__'||window.pluggyConnections.some(item=>item.item_id===previous))clearSelect.value=previous;}
  if(!data.items||!data.items.length){host.innerHTML='Nenhuma conexão cadastrada. Adicione o itemId do MeuPluggy.';return;}
  host.innerHTML=data.items.map(item=>{const investments=Number(item.investments_count||0),investmentTransactions=Number(item.investment_transactions_count||0),hasData=investments+investmentTransactions>0,synced=Boolean(item.last_synced_at),diagnostic=hasData?'Dados recebidos':synced?'Sincronização executada · nenhum dado retornado':'Item cadastrado · ainda não sincronizado',statusClass=hasData?'configured':synced?'':'warning';return `<div class="pluggy-item-row"><div><strong>${escapeHTML(item.label||item.connector_name||'MeuPluggy')}</strong><div><span class="api-status-pill ${statusClass}">${diagnostic}</span></div><div class="mini">Status da conexão: ${escapeHTML(item.status||'Desconhecido')} · ${investments} investimentos · ${investmentTransactions} movimentações de investimento${synced?' · Última sincronização '+new Date(item.last_synced_at).toLocaleString('pt-BR'):''}</div></div><button class="ghost" type="button" onclick="removePluggyItem('${item.item_id}')">Remover</button></div>`;}).join('');
  const invHost=document.getElementById('pluggyInvestments');
  if(invHost){
   const inv=data.investments||[];
   invHost.innerHTML='';
  }
 }catch(error){host.textContent=error.message||'Não foi possível carregar as conexões Pluggy.';}
}
async function addPluggyItem(){
 const itemId=document.getElementById('pluggyItemId')?.value.trim()||'';
 const label=document.getElementById('pluggyItemLabel')?.value.trim()||'';
 if(!itemId){toast('Cole o itemId copiado do Dashboard Pluggy.');return;}
 if(!await appConfirm('Adicionar conexão MeuPluggy','A conexão será registrada localmente para sincronização de contas e movimentações.','Adicionar conexão'))return;
 try{
  await api('/api/pluggy/items',{method:'POST',body:JSON.stringify({item_id:itemId,label}),skipAutoRefresh:true});
  document.getElementById('pluggyItemId').value='';document.getElementById('pluggyItemLabel').value='';
  await loadPluggyState();toast('Conexão MeuPluggy adicionada.');
 }catch(error){toast(error.message||'Não foi possível adicionar a conexão.');}
}

function openPluggyManager(){
 const modal=document.getElementById('pluggyManageModal');if(modal)modal.style.display='flex';
 if(typeof loadPluggyState==='function')loadPluggyState();
 startPluggyAutoSync();
}
function closePluggyManager(){const modal=document.getElementById('pluggyManageModal');if(modal)modal.style.display='none';}
let pluggyAutoSyncTimer=null;
let pluggyAutoSyncRunning=false;
async function savePluggyAutoSyncInterval(value){
 const interval=Number(value);
 try{
  await api('/api/pluggy/settings',{method:'POST',body:JSON.stringify({interval_minutes:interval})});
  toast(interval===0?'Sincronização automática desativada.':'Sincronização automática configurada.');
  if(pluggyAutoSyncTimer)clearInterval(pluggyAutoSyncTimer);
  startPluggyAutoSync();
 }catch(error){toast(error.message||'Não foi possível salvar o intervalo.');}
}
async function runPluggyAutoSync(){
 if(pluggyAutoSyncRunning||document.hidden)return;
 const select=document.getElementById('pluggyAutoSyncInterval');
 const interval=Number(select?.value||0);
 if(!interval)return;
 let last=0;try{last=Number(localStorage.getItem('lonelyWalletPluggyAutoSyncAt')||0)}catch(e){}
 if(Date.now()-last<interval*60000)return;
 pluggyAutoSyncRunning=true;
 try{
  await api('/api/pluggy/sync',{method:'POST',body:JSON.stringify({force:true}),skipAutoRefresh:true});
  try{localStorage.setItem('lonelyWalletPluggyAutoSyncAt',String(Date.now()))}catch(e){}
  if(typeof loadPluggyState==='function')await loadPluggyState();
  if(typeof refresh==='function')refresh();
 }catch(error){
  const host=document.getElementById('pluggyState');
  if(host)host.textContent='Falha na sincronização automática: '+(error.message||'erro desconhecido');
 }finally{pluggyAutoSyncRunning=false;}
}
async function startPluggyAutoSync(){
 const select=document.getElementById('pluggyAutoSyncInterval');
 if(!select)return;
 try{
  const settings=await api('/api/pluggy/settings');
  select.value=String(settings.interval_minutes??30);
 }catch(e){select.value='30';}
 if(pluggyAutoSyncTimer)clearInterval(pluggyAutoSyncTimer);
 if(Number(select.value)>0){
  runPluggyAutoSync();
  pluggyAutoSyncTimer=setInterval(runPluggyAutoSync,60000);
 }
}
async function syncPluggy(){
 if(!await appConfirm('Sincronizar Pluggy','A sincronização consultará somente investimentos e movimentações de investimento para atualizar sua carteira.','Sincronizar agora'))return;
 const host=document.getElementById('pluggyState');if(host)host.textContent='Sincronizando investimentos e movimentações…';
 try{
  const result=await api('/api/pluggy/sync',{method:'POST',body:JSON.stringify({force:true}),skipAutoRefresh:true});
  const s=result.summary||{};
  await loadPluggyState();
  const msg=`Sincronização concluída: ${s.investments||0} investimentos, ${s.investment_transactions||0} movimentações de investimento. ${s.operations_imported||0} operações novas, ${s.operations_matched||0} conciliadas, ${s.dividends_imported||0} proventos importados e ${s.duplicates_ignored||0} duplicidades ignoradas. ${s.fixed_income_positions||0} posições de renda fixa e ${s.market_positions||0} posições variáveis lançadas na carteira. ${s.fixed_income_skipped_missing_data||0} renda(s) fixa(s) ignorada(s) por falta de indexador ou taxa.`;
  const hasAnyData=Number(s.investments||0)+Number(s.investment_transactions||0)>0;
  const outcome=hasAnyData?'A Pluggy retornou dados.':'A API respondeu, mas não retornou investimentos ou movimentações de investimento. Confira o itemId, o status da conexão e as permissões no MeuPluggy.';
  if(host)host.textContent=outcome+' '+msg+(s.warnings?.length?' Avisos: '+s.warnings.join(' | '):'');toast(hasAnyData?'Sincronização concluída com dados.':'Sincronização sem dados retornados.');
  if(typeof refresh==='function')refresh();
 }catch(error){if(host)host.textContent=error.message||'Falha na sincronização.';toast(error.message||'Falha na sincronização.');}
}
async function clearPluggyImportedData(){
 const select=document.getElementById('pluggyClearItemSelect'),itemId=select?.value||'';
 if(!itemId){toast('Selecione uma conexão ou escolha todas.');return;}
 const all=itemId==='__all__',connections=all?(window.pluggyConnections||[]):(window.pluggyConnections||[]).filter(item=>item.item_id===itemId);
 if(!connections.length){toast('Não há conexões para limpar.');return;}
 const label=all?'todas as conexões':(select.options[select.selectedIndex]?.text||'conexão selecionada');
 if(!await appConfirm('Limpar dados importados da Pluggy','Os dados sincronizados de '+label+' serão apagados: investimentos, movimentações e lançamentos/proventos criados por essas conexões. As conexões e credenciais serão mantidas. Lançamentos manuais ou conciliados com a B3 não serão apagados. Esta ação não pode ser desfeita.','Limpar dados'))return;
 try{
  let operations=0,dividends=0;
  for(const connection of connections){
   const result=await api('/api/pluggy/items/'+encodeURIComponent(connection.item_id)+'/clear',{method:'POST',body:'{}',skipAutoRefresh:true});
   const deleted=result.deleted||{};operations+=Number(deleted.operacoes||0);dividends+=Number(deleted.proventos||0);
  }
  await loadPluggyState();
  toast('Dados removidos: '+operations+' lançamentos e '+dividends+' proventos.');
  refresh();loadDistribution();
 }catch(error){toast(error.message||'Não foi possível limpar todos os dados selecionados.');await loadPluggyState();}
}
async function removePluggyItem(itemId){
 if(!await appConfirm('Desativar conexão MeuPluggy','A conexão será desativada localmente. Os dados já importados serão preservados no SQLite.','Desativar conexão'))return;
 try{await api('/api/pluggy/items/'+encodeURIComponent(itemId),{method:'DELETE',skipAutoRefresh:true});await loadPluggyState();toast('Conexão desativada.');}
 catch(error){toast(error.message);}
}

async function savePluggyCredentials(){
 const clientId=document.getElementById('apiClientId_pluggy')?.value.trim()||'',clientSecret=document.getElementById('apiClientSecret_pluggy')?.value.trim()||'';
 if(!clientId||!clientSecret){toast('Informe o Client ID e o Client Secret da Pluggy.');return;}
 if(!await appConfirm('Salvar credenciais Pluggy','O Client ID e o Client Secret serão armazenados criptografados localmente.','Salvar credenciais'))return;
 try{await api('/api/integracoes/pluggy',{method:'POST',body:JSON.stringify({client_id:clientId,client_secret:clientSecret})});await loadAPIProviders();toast('Credenciais da Pluggy salvas com segurança.');}
 catch(error){toast(error.message||'Não foi possível salvar as credenciais.');}
}
async function saveAPIProvider(id){
 const input=document.getElementById('apiToken_'+id),token=input?.value.trim()||'';
 if(!token){toast('Cole um token antes de salvar.');return;}
 if(!await appConfirm('Salvar token da API','O token será armazenado criptografado e poderá ser utilizado pelo provedor.','Salvar token'))return;
 const status=document.getElementById('apiStatus_'+id);if(status){status.className='api-status';status.textContent='Salvando token…';}
 try{await api('/api/integracoes/'+id,{method:'POST',body:JSON.stringify({token,enabled:true}),skipAutoRefresh:true});if(input)input.value='';await loadAPIProviders();const el=document.getElementById('apiStatus_'+id);if(el){el.className='api-status ok';el.textContent='Token salvo e criptografado no armazenamento local.';}toast('Integração salva.');}
 catch(error){if(status){status.className='api-status error';status.textContent=error.message;}toast(error.message);}
}
async function testAPIProvider(id){
 const status=document.getElementById('apiStatus_'+id);if(status){status.className='api-status';status.textContent='Testando conexão…';}
 try{const result=await api('/api/integracoes/'+id+'/test',{method:'POST',body:'{}',skipAutoRefresh:true});if(status){status.className='api-status ok';status.textContent=result.message||'Conexão validada.';}}
 catch(error){if(status){status.className='api-status error';status.textContent=error.message||'Falha no teste.';}}
}
async function toggleAPIProvider(id,enabled){
 if(!await appConfirm(enabled?'Ativar API':'Desativar API',enabled?'A integração voltará a ser utilizada. O token salvo será preservado.':'A integração deixará de ser utilizada, mas o token salvo será preservado.','Confirmar'))return;
 try{
  await api('/api/integracoes/'+id,{method:'POST',body:JSON.stringify({enabled:Boolean(enabled)}),skipAutoRefresh:true});
  await loadAPIProviders();
  toast(enabled?'API ativada.':'API desativada. O token foi preservado.');
 }catch(error){toast(error.message||'Não foi possível alterar o status da API.');}
}
async function deleteAPIProvider(id){
 if(!await appConfirm('Remover credenciais da integração','O token salvo será removido do armazenamento local. Esta ação não desativa apenas a API, ela apaga a credencial.','Remover token'))return;
 try{await api('/api/integracoes/'+id,{method:'DELETE',skipAutoRefresh:true});await loadAPIProviders();toast('Token removido.');}
 catch(error){toast(error.message);}
}

function updateDocumentIdentity(name){const titles={resumo:'Resumo',proventos:'Proventos',patrimonio:'Patrimônio',distribuicao:'Distribuição',lancamentos:'Lançamentos',apis:'APIs'};document.title='Lonely Wallet | '+(titles[name]||'Investimentos');const icon=document.querySelector('link[rel=\"icon\"]');if(icon)icon.href='/static/lonely-wallet-favicon.png';}

function resetPageFilterDefaults(page){const root=document.getElementById('page-'+page);if(!root)return;const filters=root.querySelectorAll('.toolbar select,.panelhead select,.filter-row select,.filters select,.filter-bar select');filters.forEach(select=>{if(!select.options?.length)return;const initial=Array.from(select.options).find(option=>option.defaultSelected)||select.options[0];if(!initial)return;const changed=select.value!==initial.value;select.value=initial.value;select.__lwSyncCustom?.();if(changed)select.dispatchEvent(new Event('change',{bubbles:true}));});}
function showPage(name){if(!document.getElementById('page-'+name))name='resumo';document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));document.getElementById('page-'+name).classList.remove('hidden');resetPageFilterDefaults(name);document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));updateDocumentIdentity(name);if(name==='distribuicao')loadDistribution();if(name==='apis')loadAPIProviders();setTimeout(()=>{if(name==='proventos')renderProventosDashboard();Object.values(charts).forEach(c=>{try{c.resize()}catch(e){}});if(name==='resumo')alignCategoryMoveControls('summaryGroups')},100);window.scrollTo({top:0,behavior:'smooth'})}document.getElementById('nav').addEventListener('click',e=>{let b=e.target.closest('button[data-page]');if(b)showPage(b.dataset.page)});
function renderSpecificFields(type){
 const host=document.getElementById('assetSpecificFields'); if(!host)return;
 const fixed=['renda_fixa','tesouro'].includes(type);
 document.getElementById('quantityField').classList.toggle('hidden',fixed);
 quantityInput.step=fixed?'0.000001':'1';
 quantityInput.min=fixed?'0.000001':'1';
 quantityInput.value='1';
 document.getElementById('quantityLabel').textContent='Quantidade';
 document.getElementById('priceLabel').textContent=fixed?'Valor aplicado (R$)':'Preço unitário (R$)';
 const dateHint=document.getElementById('operationDateHint');
 if(dateHint) dateHint.textContent=type==='renda_fixa'
  ? 'Renda fixa (CDB, LCI, LCA e outros): lançamento registrado imediatamente, sem aguardar horário ou sessão da B3. A data informada é preservada quando for anterior.'
  : 'Datas anteriores são registradas imediatamente. Ativos negociados em bolsa seguem o calendário da B3 e podem ser agendados para a próxima sessão.';
 document.getElementById('assetFieldLabel').textContent=type==='renda_fixa'?'Identificação do investimento':type==='tesouro'?'Título do Tesouro': 'Ativo';
 assetInput.placeholder=fixed?'Ex.: CDB Nubank 120% CDI':'Selecione ou digite o ativo';
 const field=(name,label,placeholder='',kind='text')=>`<div class="field"><label>${label}</label><input name="detail_${name}" type="${kind}" placeholder="${placeholder}"></div>`;
 const select=(name,label,options)=>`<div class="field"><label>${label}</label><select name="detail_${name}">${options.map(x=>`<option>${x}</option>`).join('')}</select></div>`;
 let html='';
 if(type==='renda_fixa') html=field('emissor','Emissor','Ex.: Nubank')+select('titulo','Tipo de título',['CDB','LCI','LCA','LC','LF','RDB','Debênture','CRI','CRA','CCB','Outro'])+select('indexador','Indexador',['CDI','IPCA','Prefixado','IGP-M','Selic'])+field('taxa','Taxa / percentual','Ex.: 110% do CDI')+select('forma','Forma',['Pós-fixado','Prefixado','Híbrido'])+field('vencimento','Vencimento','','date')+select('liquidez','Liquidez',['Diária','No vencimento','Carência / prazo']);
 else if(type==='tesouro') html=select('titulo','Título',['Tesouro Selic','Tesouro Prefixado','Tesouro IPCA+','Tesouro RendA+','Tesouro Educa+'])+field('vencimento','Vencimento','','date')+field('taxa','Taxa contratada','Ex.: IPCA + 6,5%');
 else if(type==='fundo') html=field('gestora','Gestora','Nome da gestora')+field('cnpj','CNPJ','00.000.000/0000-00')+field('cotas','Quantidade de cotas','0,0000')+field('valor_investido','Valor investido','0,00');
 else if(type==='stocks'||type==='internacional'||type==='reit') html=select('moeda','Moeda',['USD','EUR','BRL'])+field('cambio','Câmbio utilizado','Ex.: 5,20');
 else if(type==='cripto') html=select('moeda','Moeda de negociação',['BRL','USD','USDT'])+field('corretora','Corretora / exchange','Nome da plataforma');
 else if(type==='outros') html=field('descricao','Descrição do ativo','Identificação do investimento')+field('juros','Juros / rendimento anual','Ex.: 12,5%');
 host.innerHTML=html;
}
async function loadSellableAssets(){
 try{
  const data=await api('/api/carteira');
  sellableAssets=(data.itens||[]).filter(item=>Number(item.quantidade)>0);
 }catch(e){sellableAssets=[];}
}
async function setOperationSide(side){
 const previousTicker=String(assetInput.value||'').trim().toUpperCase();
 const previousType=assetType.value;
 document.getElementById('operationSide').value=side;
 document.querySelectorAll('.operation-side').forEach(button=>button.classList.toggle('active',button.dataset.side===side));
 closeSuggestions();
 if(side==='venda'){
  await loadSellableAssets();
  // Ao alternar Compra/Venda dentro do lançamento iniciado pelo menu do ativo,
  // preserva a seleção se a posição realmente existir na carteira.
  const existing=previousTicker?sellableAssets.find(item=>
   String(item.ticker||'').trim().toUpperCase()===previousTicker&&
   String(item.tipo||'').toLowerCase()===String(previousType||'').toLowerCase()
  ):null;
  if(existing){
   selectedAsset=existing;
   assetType.value=existing.tipo||previousType;
   assetInput.value=existing.ticker;
   const fixed=['renda_fixa','tesouro'].includes(String(existing.tipo||'').toLowerCase());
   if(fixed){
    const quantity=Number(existing.quantidade||1);
    quantityInput.value=String(quantity>0?quantity:1);
    quantityInput.step='0.000001';quantityInput.min='0.000001';
    const price=Number(existing.preco_atual??existing.preco_medio??0);
    if(price>0)moneyInput(price);else assetPrice.value='';
    assetHint.textContent=`Investimento selecionado para venda. Saldo disponível: ${brl(existing.valor_atual??quantity*price)}.`;
   }else{
    quantityInput.value='1';quantityInput.step='1';quantityInput.min='1';
    const price=Number(existing.preco_atual??existing.preco_medio??0);
    if(price>0)moneyInput(price);else assetPrice.value='';
    assetHint.textContent='Ativo mantido para venda. Informe a quantidade que deseja vender.';
   }
   updateOperationTotal();
   closeFixedIncomeSalePicker();
   return;
  }
  selectedAsset=null;assetInput.value='';assetPrice.value='';
  if(assetType.value==='renda_fixa'){openFixedIncomeSalePicker();return;}
  const categoryHoldings=sellableAssets.filter(item=>String(item.tipo||'').toLowerCase()===String(assetType.value).toLowerCase());
  assetHint.textContent=categoryHoldings.length
   ? 'Selecione somente um ativo desta categoria que já possui em carteira.'
   : 'Você não possui ativos disponíveis nesta categoria para vender.';
  if(categoryHoldings.length){suggestions.classList.remove('hidden');searchAssets();}
 }else{
  // Alternar de Venda para Compra não deve apagar o ativo já escolhido.
  const current=selectedAsset&&
   String(selectedAsset.ticker||'').trim().toUpperCase()===previousTicker&&
   String(selectedAsset.tipo||'').toLowerCase()===String(previousType||'').toLowerCase()
    ? selectedAsset
    : (state.itens||[]).find(item=>
       String(item.ticker||'').trim().toUpperCase()===previousTicker&&
       String(item.tipo||'').toLowerCase()===String(previousType||'').toLowerCase()
      );
  if(current&&previousTicker){
   selectedAsset=current;
   assetType.value=current.tipo||previousType;
   assetInput.value=current.ticker;
   quantityInput.step=['renda_fixa','tesouro'].includes(String(current.tipo||'').toLowerCase())?'0.000001':'1';
   quantityInput.min=quantityInput.step;
   if(!quantityInput.value||Number(quantityInput.value)<=0)quantityInput.value='1';
   assetHint.textContent='Ativo mantido para compra. Você pode ajustar a quantidade e o preço.';
   closeSuggestions();
   updateOperationTotal();
  }else{
   selectedAsset=null;assetInput.value='';assetPrice.value='';
   assetHint.textContent='Digite pelo menos 2 caracteres para buscar na B3.';
  }
 }
}
async function syncProventosHistory(){
 if(!await appConfirm('Atualizar histórico de proventos','O aplicativo consultará as fontes de proventos ativas e atualizará os eventos disponíveis.','Atualizar histórico'))return;
 const button=document.getElementById('syncProventosButton');
 if(button){button.disabled=true;button.textContent='Sincronizando…';}
 try{
  const result=await api('/api/proventos/sincronizar',{method:'POST',body:'{}'});
  await refresh();
  toast(result.mensagem||'Histórico de proventos atualizado.');
 }catch(error){toast(error.message||'Não foi possível atualizar os proventos.')}
 finally{if(button){button.disabled=false;button.textContent='↻ Atualizar histórico';}}
}

let goalWizardType='';
const goalCategories=[['total','Total de patrimônio'],['brasil','Total investido no Brasil'],['exterior','Total investido no exterior'],['acao','Total investido em Ações'],['fundo','Total investido em Fundos de Investimentos'],['fii','Total investido em FIIs'],['etf','Total investido em ETFs'],['internacional','Total investido em ETFs Internacionais'],['stocks','Total investido em Stocks'],['bdr','Total investido em BDRs'],['cripto','Total investido em Criptomoedas'],['tesouro','Total investido em Tesouro Direto'],['renda_fixa','Total investido em Renda Fixa'],['outros','Total em Outros']];
const goalAssetTypes=[['acao','Ações'],['fii','FIIs'],['stocks','Stocks'],['bdr','BDRs'],['etf','ETFs'],['internacional','ETFs Internacionais'],['cripto','Criptomoedas'],['renda_fixa','Renda Fixa'],['tesouro','Tesouro Direto'],['fundo','Fundos de Investimentos'],['reit','REITs'],['outros','Outros']];
const goalIncomeTypes=[['acao','Ações'],['fii','FIIs'],['stocks','Stocks'],['bdr','BDRs'],['etf','ETFs'],['internacional','ETFs Internacionais'],['reit','REITs'],['renda_fixa','Renda Fixa'],['fundo','Fundos de Investimentos']];
function openGoalWizard(){editingOperationId=null;document.getElementById('modalback').querySelector('.modal').classList.add('goal-wizard-modal');document.querySelector('#modalback .modal > .modalhead').classList.remove('hidden');document.getElementById('modalback').style.display='flex';['opForm','provForm','metaForm'].forEach(id=>document.getElementById(id).classList.add('hidden'));document.getElementById('modalTitle').textContent='Criar Meta';document.getElementById('goalWizard').classList.remove('hidden');goalWizardType='';renderGoalWizard();}
function renderGoalWizard(){const host=document.getElementById('goalWizard');if(!host)return;
 if(!goalWizardType){document.querySelector('#modalback .modal > .modalhead').classList.remove('hidden');host.innerHTML=`<div class="goal-wizard-body"><button type="button" class="goal-wizard-choice" onclick="chooseGoalType('patrimonio')"><span class="goal-icon">◎</span><span><strong>Meta de Patrimônio</strong><small>Defina uma meta de patrimônio que melhor se alinhe com seu perfil de investimento e seus objetivos pessoais.</small></span></button><button type="button" class="goal-wizard-choice" onclick="chooseGoalType('ativos')"><span class="goal-icon">▣</span><span><strong>Meta de Ativos</strong><small>Estabeleça metas por tipos de ativos de acordo com seu perfil.</small></span></button><button type="button" class="goal-wizard-choice" onclick="chooseGoalType('proventos')"><span class="goal-icon">▤</span><span><strong>Meta de Proventos</strong><small>Estabeleça a média de proventos que deseja receber mensalmente por tipo de ativo.</small></span></button></div>`;return;}
 document.querySelector('#modalback .modal > .modalhead').classList.add('hidden');
 const typeName=goalWizardType==='patrimonio'?'Meta de Patrimônio':goalWizardType==='ativos'?'Meta de ativos':'Meta de proventos';
 let fields='';
 if(goalWizardType==='patrimonio')fields=`<div class="goal-wizard-grid"><div class="goal-wizard-field"><label>Escolha uma categoria para sua meta</label><select name="categoria" required>${goalCategories.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div class="goal-wizard-field"><label>Valor total</label><div class="goal-input-prefix"><span>R$</span><input name="objetivo" type="number" min="0.01" step="0.01" placeholder="0,00" required></div></div></div><h3>Como você planeja alcançar essa meta?</h3><div class="goal-wizard-grid two"><div class="goal-wizard-field"><label>Aporte mensal</label><div class="goal-input-prefix"><span>R$</span><input name="aporte" type="number" min="0" step="0.01" value="0"></div></div><div class="goal-wizard-field"><label>Estimativa de variação anual</label><div class="goal-input-prefix suffix"><input name="variacao_anual" type="number" step="0.01" value="0"><span>%</span></div></div></div>`;
 if(goalWizardType==='ativos')fields=`<div class="goal-wizard-grid two"><div class="goal-wizard-field"><label>Tipo de ativo</label><select name="categoria" id="goalAssetType" onchange="updateGoalAssetOptions()">${goalAssetTypes.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div class="goal-wizard-field"><label>Ativo</label><select name="ticker" id="goalAssetTicker" required><option value="">Selecione</option></select></div></div><h3>Como você planeja alcançar essa meta?</h3><div class="goal-wizard-grid two"><div class="goal-wizard-field"><label>Aporte mensal</label><div class="goal-input-prefix"><span>R$</span><input name="aporte" type="number" min="0" step="0.01" value="0"></div></div><div class="goal-wizard-field"><label>Estimativa de variação anual</label><div class="goal-input-prefix suffix"><input name="variacao_anual" type="number" step="0.01" value="10"><span>%</span></div></div><div class="goal-wizard-field"><label>Valor final da meta (R$)</label><div class="goal-input-prefix"><span>R$</span><input name="objetivo" type="number" min="0.01" step="0.01" required></div></div></div>`;
 if(goalWizardType==='proventos')fields=`<div class="goal-wizard-field"><label>Selecione os tipos de ativos</label><div class="goal-wizard-classes">${goalIncomeTypes.map(([v,l])=>`<label><input type="checkbox" name="classes" value="${v}" checked> ${l}</label>`).join('')}</div></div><div class="goal-wizard-field"><label>Média de proventos que deseja receber mensalmente</label><div class="goal-input-prefix"><span>R$</span><input name="objetivo" type="number" min="0.01" step="0.01" placeholder="0,00" required></div><small class="mini">Consideramos a média de proventos recebidos nos últimos 12 meses.</small></div>`;
 host.innerHTML=`<div class="modalhead"><div><button type="button" class="goal-wizard-back" onclick="goalWizardType='';renderGoalWizard()">←</button><h2 style="display:inline">Criar Meta</h2></div><button class="close" onclick="closeModal()">×</button></div><div class="goal-wizard-body"><span class="goal-wizard-tag">${typeName}</span><form id="goalWizardForm">${fields}<div class="goal-wizard-actions"><button type="button" class="ghost" onclick="closeModal()">Cancelar</button><button type="submit" class="primary">Criar Meta</button></div></form></div>`;
 if(goalWizardType==='ativos')updateGoalAssetOptions();
 document.getElementById('goalWizardForm').addEventListener('submit',saveGoalWizard);
}
function chooseGoalType(type){goalWizardType=type;renderGoalWizard();}
function updateGoalAssetOptions(){const type=document.getElementById('goalAssetType')?.value,select=document.getElementById('goalAssetTicker');if(!select)return;const assets=(state.itens||[]).filter(x=>x.tipo===type);select.innerHTML='<option value="">Selecione</option>'+assets.map(x=>`<option value="${escapeHTML(x.ticker)}">${escapeHTML(x.ticker)}${x.nome&&x.nome!==x.ticker?' — '+escapeHTML(x.nome):''}</option>`).join('');}
async function saveGoalWizard(event){event.preventDefault();const form=event.currentTarget,data=new FormData(form),type=goalWizardType;const objective=Number(data.get('objetivo')||0);if(!(objective>0)){toast('Informe um valor objetivo válido.');return;}let category=String(data.get('categoria')||''),ticker=String(data.get('ticker')||''),classes=data.getAll('classes');if(type==='ativos'&&!ticker){toast('Selecione um ativo para a meta.');return;}if(type==='proventos'&&!classes.length){toast('Selecione pelo menos um tipo de ativo.');return;}let name='';if(type==='patrimonio')name='Meta de Patrimônio · '+(goalCategories.find(x=>x[0]===category)?.[1]||category);if(type==='ativos')name='Meta de Ativo · '+ticker;if(type==='proventos')name='Meta de Proventos Mensais';const payload={nome:name,objetivo,aporte:Number(data.get('aporte')||0),tipo:type==='ativos'?'ativos':type,categoria:category,ticker,variacao_anual:Number(data.get('variacao_anual')||0),classes:JSON.stringify(classes)};if(!await appConfirm('Criar meta','A nova meta será salva e passará a aparecer no acompanhamento da carteira.','Criar meta'))return;try{await api('/api/metas',{method:'POST',body:JSON.stringify(payload)});closeModal();await refresh();toast('Meta criada com sucesso.');}catch(error){toast(error.message||'Não foi possível criar a meta.')}}

function openModal(type){if(type==='meta'){openGoalWizard();return;}document.querySelector('#modalback .modal').classList.remove('goal-wizard-modal');document.querySelector('#modalback .modal > .modalhead').classList.remove('hidden');editingOperationId=null;const opSubmit=document.querySelector('#opForm .modalactions button.primary');if(opSubmit)opSubmit.textContent='＋ Adicionar lançamento';document.getElementById('modalback').style.display='flex';document.getElementById('goalWizard')?.classList.add('hidden');if(type==='op'){syncAssetTypeOptions();setOperationSide('compra');quantityInput.value='1';unitPriceInput.value='';costsInput.value='0,00';updateOperationTotal();}document.getElementById('opForm').classList.toggle('hidden',type!=='op');document.getElementById('provForm').classList.toggle('hidden',type!=='prov');document.getElementById('metaForm').classList.toggle('hidden',type!=='meta');document.getElementById('modalTitle').textContent=type==='op'?'Adicionar lançamento':type==='prov'?'Registrar provento':'Criar meta';const now=new Date();const local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);document.getElementById('opDateTime').value=local.slice(0,10);document.getElementById('opDate').value=local.slice(0,10);renderSpecificFields(assetType.value)}function closeModal(){
 editingOperationId=null;const opSubmit=document.querySelector('#opForm .modalactions button.primary');if(opSubmit)opSubmit.textContent='＋ Adicionar lançamento';
 document.getElementById('modalback').style.display='none';document.getElementById('goalWizard')?.classList.add('hidden');document.querySelector('#modalback .modal').classList.remove('goal-wizard-modal');document.querySelector('#modalback .modal > .modalhead').classList.remove('hidden');
 ['opForm','provForm','metaForm'].forEach(id=>document.getElementById(id).reset());
 quantityInput.value='1';unitPriceInput.value='';costsInput.value='0,00';setOperationSide('compra');updateOperationTotal();selectedAsset=null;closeSuggestions();
 assetHint.textContent='Digite pelo menos 2 caracteres para buscar na B3.';
}

// Quantidade inicia em 1 e o total é recalculado em tempo real.
const quantityInput=document.getElementById('opQuantity');
const unitPriceInput=document.getElementById('opUnitPrice');
const costsInput=document.getElementById('opCosts');
const operationTotal=document.getElementById('opTotal');
function parseLocalizedNumber(value){
 if(typeof value==='number')return Number.isFinite(value)?value:0;
 let raw=String(value??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');
 if(!raw)return 0;
 // Aceita tanto 10.000,50 (pt-BR) quanto 10000.50 (decimal internacional).
 if(raw.includes(','))raw=raw.replace(/\./g,'').replace(',','.');
 else if((raw.match(/\./g)||[]).length>1)raw=raw.replace(/\./g,'');
 else if(/\.\d{1,2}$/.test(raw)){}
 else raw=raw.replace(/\./g,'');
 const parsed=Number(raw);
 return Number.isFinite(parsed)?parsed:0;
}
function formatMoneyInput(input,final=false){
 if(!input)return;
 const raw=String(input.value??'').trim();
 if(!raw)return;
 let normalized=raw.replace(/R\$/gi,'').replace(/\s/g,'');
 let decimal='';
 if(normalized.includes(',')){
  const parts=normalized.split(',');
  decimal=parts.pop().replace(/\D/g,'').slice(0,2);
  normalized=parts.join('').replace(/\D/g,'');
 }else if(/\.\d{1,2}$/.test(normalized)){
  const parts=normalized.split('.');
  decimal=parts.pop().replace(/\D/g,'').slice(0,2);
  normalized=parts.join('').replace(/\D/g,'');
 }else normalized=normalized.replace(/\D/g,'');
 const integer=(normalized||'0').replace(/^0+(?=\d)/,'');
 const grouped=integer.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
 input.value=final?`${grouped},${decimal.padEnd(2,'0')}`:(decimal!==''?`${grouped},${decimal}`:grouped);
}
function updateOperationTotal(){
 const quantity=Math.max(0,parseLocalizedNumber(quantityInput.value));
 const unitPrice=Math.max(0,parseLocalizedNumber(unitPriceInput.value));
 const costs=Math.max(0,parseLocalizedNumber(costsInput?.value));
 operationTotal.textContent=(quantity*unitPrice+costs).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}
quantityInput.addEventListener('input',updateOperationTotal);
[unitPriceInput,costsInput].forEach(input=>{
 input.addEventListener('input',()=>{
  const start=input.selectionStart;
  formatMoneyInput(input,false);
  try{input.setSelectionRange(input.value.length,input.value.length);}catch(_){}
  updateOperationTotal();
 });
 input.addEventListener('blur',()=>{
  formatMoneyInput(input,true);
  updateOperationTotal();
 });
});
quantityInput.addEventListener('change',()=>{
 if(!quantityInput.value||Number(quantityInput.value)<1)quantityInput.value='1';
 updateOperationTotal();
});

// Autocomplete de ativos e preenchimento automático da cotação.
const assetInput=document.getElementById('assetTicker');
const assetType=document.querySelector('#opForm select[name="tipo"]');
const assetPrice=document.querySelector('#opForm input[name="preco"]');
const suggestions=document.getElementById('assetSuggestions');
const assetHint=document.getElementById('assetHint');
let assetSearchTimer=null, assetSearchController=null, selectedAsset=null, sellableAssets=[];

function escapeHTML(value){
 return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function closeSuggestions(){suggestions.classList.add('hidden');suggestions.innerHTML='';}
function moneyInput(value){
 const n=Number(value);
 if(Number.isFinite(n)&&n>0){
  assetPrice.value=n.toFixed(2);
  assetHint.textContent='Cotação preenchida automaticamente. Confira o valor antes de salvar.';
  updateOperationTotal();
 }
}
async function fillAssetQuote(ticker){
 assetHint.textContent='Consultando cotação de '+ticker+'…';
 try{
  const quote=await api('/api/ativo/'+encodeURIComponent(ticker));
  const price=quote.regularMarketPrice ?? quote.close;
  if(price!==undefined&&price!==null) moneyInput(price);
  else assetHint.textContent='Ativo selecionado. Cotação indisponível; informe o preço manualmente.';
 }catch(e){assetHint.textContent='Ativo selecionado. Não foi possível obter a cotação; informe o preço manualmente.';}
}
async function searchAssets(){
 const q=assetInput.value.trim(), tipo=assetType.value;
 selectedAsset=null;
 if(document.getElementById('operationSide').value==='venda'){
  await loadSellableAssets();
  const matches=sellableAssets.filter(item=>
   String(item.tipo||'').toLowerCase()===String(tipo).toLowerCase()&&
   (String(item.ticker||'').toUpperCase().includes(q.toUpperCase())||
    String(item.nome||'').toUpperCase().includes(q.toUpperCase()))
  ).map(item=>({...item,preco:item.preco_atual??item.preco_medio}));
  suggestions.classList.remove('hidden');
  if(!matches.length){
   const categoryNames={acao:'ações',fii:'FIIs',stocks:'Stocks',bdr:'BDRs',etf:'ETFs',internacional:'ETFs internacionais',reit:'REITs',cripto:'criptomoedas',renda_fixa:'renda fixa',tesouro:'Tesouro Direto',fundo:'fundos de investimento',outros:'outros ativos'};
   const message=q.length<1
    ? `Você não possui ${categoryNames[tipo]||'ativos desta categoria'} disponíveis para vender.`
    : `Nenhum ativo de ${categoryNames[tipo]||'esta categoria'} corresponde à busca.`;
   suggestions.innerHTML='<div class="suggestion-empty">'+escapeHTML(message)+'</div>';
   return;
  }
  suggestions.innerHTML=matches.map((item,i)=>`<div class="suggestion" data-index="${i}"><span><b>${escapeHTML(item.ticker)}</b><span class="suggestion-name">${escapeHTML(item.nome||item.ticker)} · Disponível: ${Number(item.quantidade).toLocaleString('pt-BR')}</span></span><span class="suggestion-price">${item.preco?Number(item.preco).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Informe o preço'}</span></div>`).join('');
  [...suggestions.querySelectorAll('.suggestion')].forEach((el,i)=>el.addEventListener('click',()=>{
   const item=matches[i];assetInput.value=item.ticker;selectedAsset=item;closeSuggestions();
   quantityInput.value='1';quantityInput.step='1';quantityInput.min='1';
   if(item.preco)moneyInput(item.preco);
   updateOperationTotal();
   assetHint.textContent='Posição disponível para venda: '+Number(item.quantidade).toLocaleString('pt-BR')+' unidades.';
  }));
  return;
 }
 if(q.length<2){closeSuggestions();assetHint.textContent='Digite pelo menos 2 caracteres para buscar na B3.';return;}
 if(['internacional','cripto','renda_fixa','reit','tesouro','outros'].includes(tipo)){
  closeSuggestions();assetHint.textContent='Busca automática ainda não disponível para esta classe. Você pode digitar o ticker manualmente.';return;
 }
 if(assetSearchController)assetSearchController.abort();
 assetSearchController=new AbortController();
 suggestions.classList.remove('hidden');
 suggestions.innerHTML='<div class="suggestion-empty">Buscando ativos…</div>';
 try{
  const response=await fetch('/api/ativos/busca?q='+encodeURIComponent(q)+'&tipo='+encodeURIComponent(tipo),{signal:assetSearchController.signal});
  const data=await response.json();
  if(!response.ok)throw new Error(data.mensagem||'Falha na busca');
  let availableItems=data.itens||[];
  if(document.getElementById('operationSide').value==='venda'){
   if(!sellableAssets.length)await loadSellableAssets();
   const owned=new Set(sellableAssets.map(item=>item.ticker.toUpperCase()));
   availableItems=availableItems.filter(item=>owned.has(String(item.ticker||'').toUpperCase()));
  }
  if(!availableItems.length){
   const message=document.getElementById('operationSide').value==='venda'
    ? 'Esse ativo não está na sua carteira. Para vender, selecione um ativo que você já possui.'
    : (data.mensagem||'Nenhum ativo encontrado. Você pode informar o ticker manualmente.');
   suggestions.innerHTML='<div class="suggestion-empty">'+escapeHTML(message)+'</div>';
   return;
  }
  data.itens=availableItems;
  suggestions.innerHTML=data.itens.map((item,i)=>`<div class="suggestion" data-index="${i}"><span><b>${escapeHTML(item.ticker)}</b><span class="suggestion-name">${escapeHTML(item.nome)}</span></span><span class="suggestion-price">${item.preco?Number(item.preco).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Cotação sob consulta'}</span></div>`).join('');
  [...suggestions.querySelectorAll('.suggestion')].forEach((el,i)=>el.addEventListener('click',()=>{
   const item=data.itens[i];assetInput.value=item.ticker;selectedAsset=item;closeSuggestions();
   if(!['renda_fixa','tesouro'].includes(assetType.value)){
    quantityInput.value='1';quantityInput.step='1';quantityInput.min='1';
   }
   if(item.preco)moneyInput(item.preco);
   updateOperationTotal();
   fillAssetQuote(item.ticker);
  }));
 }catch(err){
  if(err.name!=='AbortError')suggestions.innerHTML='<div class="suggestion-empty">Busca indisponível no momento. Você pode digitar o ticker manualmente.</div>';
 }
}
assetInput.addEventListener('input',()=>{
 clearTimeout(assetSearchTimer);
 assetSearchTimer=setTimeout(searchAssets,300);
});
assetType.addEventListener('change',async ()=>{
 renderSpecificFields(assetType.value);
 closeSuggestions();selectedAsset=null;assetPrice.value='';
 assetHint.textContent='Digite pelo menos 2 caracteres para buscar na B3.';
 if(document.getElementById('operationSide').value==='venda'&&assetType.value==='renda_fixa'){
  await loadSellableAssets();openFixedIncomeSalePicker();
 }else if(assetInput.value.trim().length>=2)searchAssets();
});
assetInput.addEventListener('keydown',e=>{
 if(e.key==='Escape')closeSuggestions();
 if(e.key==='Enter'&&!suggestions.classList.contains('hidden')){
  const first=suggestions.querySelector('.suggestion');if(first){e.preventDefault();first.click();}
 }
});
document.addEventListener('click',e=>{if(!e.target.closest('.asset-field'))closeSuggestions();});
assetInput.addEventListener('blur',()=>{
 setTimeout(()=>{
  closeSuggestions();
  const ticker=assetInput.value.trim().toUpperCase();
  if(ticker&&document.getElementById('operationSide').value==='venda'&&
     (!selectedAsset||selectedAsset.ticker.toUpperCase()!==ticker||!sellableAssets.some(item=>item.ticker.toUpperCase()===ticker))){
   assetInput.value='';selectedAsset=null;assetPrice.value='';updateOperationTotal();
   assetHint.textContent='Venda permitida somente para ativos que você já possui. Escolha um ativo da lista.';
   return;
  }
  if(ticker&&!['renda_fixa','tesouro','outros','cripto','internacional','reit'].includes(assetType.value)&&(!selectedAsset||selectedAsset.ticker!==ticker)){
   quantityInput.value='1';quantityInput.step='1';quantityInput.min='1';updateOperationTotal();fillAssetQuote(ticker);
  }
 },180);
});

async function submitForm(id,url){document.getElementById(id).addEventListener('submit',async e=>{e.preventDefault();const isEdit=id==='opForm'&&!!editingOperationId;const labelsConfirm={opForm:isEdit?'Salvar alterações do lançamento':'Adicionar lançamento',provForm:'Registrar provento',metaForm:'Salvar meta'};const messagesConfirm={opForm:isEdit?'As alterações deste lançamento serão gravadas e os cálculos da carteira serão atualizados.':'O novo lançamento será adicionado à carteira e afetará os cálculos e gráficos.',provForm:'O registro de provento será salvo e poderá atualizar os totais e gráficos.',metaForm:'As informações da meta serão salvas.'};if(!await appConfirm(labelsConfirm[id]||'Confirmar alteração',messagesConfirm[id]||'Deseja salvar estas alterações?','Confirmar'))return;let data=Object.fromEntries(new FormData(e.target));if(id==='opForm'&&data.lado==='venda'&&!editingOperationId){await loadSellableAssets();const ticker=String(data.ticker||'').trim().toUpperCase();if(!sellableAssets.some(item=>item.ticker.toUpperCase()===ticker)){toast('Só é permitido vender ativos que já estão na sua carteira.');return;}const holding=sellableAssets.find(item=>item.ticker.toUpperCase()===ticker);if(Number(data.quantidade)>Number(holding.quantidade)+1e-8){toast('A quantidade informada é maior que a quantidade disponível na carteira.');return;}}if(id==='opForm'){data.preco=String(parseLocalizedNumber(data.preco));data.custos=String(parseLocalizedNumber(data.custos));data.data=data.data_hora.slice(0,10);data.detalhes=Object.fromEntries(Object.entries(data).filter(([k])=>k.startsWith('detail_')).map(([k,v])=>[k.slice(7),v]));Object.keys(data).filter(k=>k.startsWith('detail_')).forEach(k=>delete data[k]);}try{const saved=await api(id==='opForm'&&editingOperationId?`/api/operacoes/${editingOperationId}`:url,{method:id==='opForm'&&editingOperationId?'PUT':'POST',body:JSON.stringify(data)});if(id==='opForm')editingOperationId=null;e.target.reset();if(id==='opForm'){quantityInput.value='1';updateOperationTotal();}closeModal();await refresh();if(id==='opForm'&&saved.status==='agendada'){toast('Operação agendada para '+new Date(saved.data_execucao).toLocaleString('pt-BR')+'.')}else if(id==='opForm'){toast('Lançamento salvo. Carteira, posições e gráficos atualizados.')}else toast('Registro salvo com sucesso.')}catch(err){toast(err.message)}})}submitForm('opForm','/api/operacoes');submitForm('provForm','/api/proventos');submitForm('metaForm','/api/metas');
function isPluggyOperation(op){try{const meta=typeof op?.detalhes==='string'?JSON.parse(op.detalhes||'{}'):(op?.detalhes||{});return String(meta?.origem||'').trim().toLowerCase()==='pluggy';}catch{return false;}}
async function editOperation(id){const op=(state.operacoes||[]).find(x=>Number(x.id)===Number(id));if(!op){toast('Lançamento não encontrado.');return;}if(isPluggyOperation(op)){toast('Lançamentos importados pela Pluggy são somente leitura.');return;}editingOperationId=Number(id);document.getElementById('modalback').style.display='flex';document.getElementById('opForm').classList.remove('hidden');document.getElementById('provForm').classList.add('hidden');document.getElementById('metaForm').classList.add('hidden');document.getElementById('modalTitle').textContent='Editar lançamento';syncAssetTypeOptions();const typeSelect=document.getElementById('assetType');if(![...typeSelect.options].some(option=>option.value===(op.tipo||'acao'))){const option=document.createElement('option');option.value=op.tipo||'acao';option.textContent=labels[op.tipo]||op.tipo;typeSelect.appendChild(option);}typeSelect.value=op.tipo||'acao';document.getElementById('operationSide').value=op.lado||'compra';document.querySelectorAll('.operation-side').forEach(button=>button.classList.toggle('active',button.dataset.side===(op.lado||'compra')));selectedAsset=null;closeSuggestions();document.getElementById('assetTicker').value=op.ticker||'';const stamp=op.data_execucao||op.data||new Date().toISOString().slice(0,10);document.getElementById('opDateTime').value=String(stamp).slice(0,10);document.getElementById('opDate').value=String(stamp).slice(0,10);try{const details=typeof op.detalhes==='string'?JSON.parse(op.detalhes||'{}'):(op.detalhes||{});renderSpecificFields(op.tipo||'acao');Object.entries(details).forEach(([key,value])=>{const field=document.querySelector(`#opForm [name="detail_${CSS.escape(key)}"]`);if(field)field.value=value;});}catch(e){renderSpecificFields(op.tipo||'acao')}document.getElementById('opQuantity').value=op.quantidade??1;document.getElementById('opUnitPrice').value=String(op.preco??0).replace('.',',');document.getElementById('opCosts').value=String(op.custos??0).replace('.',',');updateOperationTotal();const submit=document.querySelector('#opForm .modalactions button.primary');if(submit)submit.textContent='Salvar alterações';}
async function removeOperation(id){const op=(state.operacoes||[]).find(x=>Number(x.id)===Number(id));if(op&&isPluggyOperation(op)){toast('Lançamentos importados pela Pluggy são somente leitura.');return;}if(!await appConfirm('Excluir lançamento','Tem certeza de que deseja excluir este lançamento? Esta ação não pode ser desfeita.','Excluir lançamento'))return;try{await api('/api/operacoes/'+id,{method:'DELETE'});await refresh();toast('Lançamento excluído.')}catch(e){toast(e.message)}}async function removeGoal(id){if(!await appConfirm('Excluir meta','Esta meta será removida permanentemente.','Excluir meta'))return;try{await api('/api/metas/'+id,{method:'DELETE'});await refresh();toast('Meta excluída.')}catch(e){toast(e.message)}}

// IRPF e DARFs: registros auxiliares separados das operações da carteira.
function localISODate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function setupTaxYearFilters(){
 const current=new Date().getFullYear();
 [['irpfYearFilter',current],['darfYearFilter',current]].forEach(([id,selected])=>{
  const select=document.getElementById(id);if(!select||select.options.length)return;
  select.innerHTML=Array.from({length:9},(_,i)=>current+1-i).map(y=>`<option value="${y}" ${y===selected?'selected':''}>${y}</option>`).join('');
 });
}
function dateBR(value){const raw=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return '—';const [y,m,d]=raw.split('-');return `${d}/${m}/${y}`}
function monthBR(value){const [y,m]=String(value||'').split('-');return m&&y?`${m}/${y}`:'—'}
function downloadTaxCSV(filename,rows){
 const csv=(rows||[]).map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
async function loadIRPF(){
 setupTaxYearFilters();const year=document.getElementById('irpfYearFilter')?.value||new Date().getFullYear();
 try{irpfData=await api(`/api/irpf/resumo?ano=${encodeURIComponent(year)}`);renderIRPF();}
 catch(e){toast(e.message)}
}
function showIRPFTab(name){
 activeIRPFTab=name;
 document.querySelectorAll('[data-irpf-tab]').forEach(button=>button.classList.toggle('active',button.dataset.irpfTab===name));
 document.querySelectorAll('.tax-tab-pane').forEach(pane=>pane.classList.toggle('hidden',pane.id!==`irpfPane-${name}`));
}
function renderIRPF(){
 const summary=irpfData.resumo||{};const year=irpfData.ano||new Date().getFullYear();
 const stats=[
  ['Bens e direitos',brl(summary.bens||0),'Custo de aquisição em 31/12'],
  ['Rendimentos isentos',brl(summary.isentos||0),'Valores informados manualmente'],
  ['Tributação exclusiva',brl(summary.exclusivos||0),'Valores informados manualmente'],
  ['Resultado de vendas',brl(summary.resultado_vendas||0),'Estimativa pelas operações registradas']
 ];
 document.getElementById('irpfStats').innerHTML=stats.map(([label,value,detail])=>`<div class="card stat"><div class="statlabel">${label}</div><div class="statvalue">${value}</div><div class="statdetail"><span>${detail}</span></div></div>`).join('');
 const positions=irpfData.posicoes||[];document.getElementById('irpfPositionCount').textContent=`${positions.length} ativo(s) · ano-base ${year}`;
 document.getElementById('irpfPositionRows').innerHTML=positions.length?positions.map(item=>`<tr><td class="ticker">${escapeHTML(item.ticker)}</td><td>${escapeHTML(labels[item.tipo]||item.tipo)}</td><td>${Number(item.quantidade).toLocaleString('pt-BR',{maximumFractionDigits:8})}</td><td>${brl(item.preco_medio)}</td><td>${brl(item.custo_total)}</td></tr>`).join(''):rowEmpty(5,'Não há posições no ano-base selecionado.');
 const incomes=irpfData.rendimentos||[];
 const incomeRows=group=>{
  const rows=incomes.filter(item=>item.grupo===group);
  return rows.length?rows.map(item=>`<tr><td>${escapeHTML(item.natureza)}</td><td>${escapeHTML(item.fonte_pagadora)}</td><td>${escapeHTML(item.documento||'—')}</td><td>${dateBR(item.data)}</td><td>${brl(item.valor)}</td><td><button class="tax-action" onclick="editIRPFIncome(${item.id})">Editar</button><button class="tax-action danger" onclick="deleteIRPFIncome(${item.id})">Excluir</button></td></tr>`).join(''):rowEmpty(6,'Nenhum rendimento cadastrado neste grupo.');
 };
 document.getElementById('irpfIsentoRows').innerHTML=incomeRows('isento');
 document.getElementById('irpfExclusivaRows').innerHTML=incomeRows('exclusiva');
 const sales=irpfData.operacoes||[];
 const saleRows=group=>{const rows=sales.filter(item=>item.grupo===group);return rows.length?rows.map(item=>`<tr><td>${monthBR(item.mes)}</td><td>${brl(item.vendas)}</td><td>${brl(item.custo)}</td><td class="${Number(item.resultado)>=0?'green':'red'}">${brl(item.resultado)}</td><td>${item.operacoes}</td></tr>`).join(''):rowEmpty(5,'Não há vendas registradas para este grupo no ano-base.');};
 document.getElementById('irpfComunsRows').innerHTML=saleRows('comuns');
 document.getElementById('irpfFiisRows').innerHTML=saleRows('fiis');
}
function openTaxModal(type,group,item){
 const back=document.getElementById('taxModalBack');const irpfForm=document.getElementById('irpfEntryForm');const darfForm=document.getElementById('darfForm');
 irpfForm.classList.toggle('hidden',type!=='irpf');darfForm.classList.toggle('hidden',type!=='darf');
 if(type==='irpf'){
  irpfForm.reset();document.getElementById('irpfEntryId').value=item?.id||'';
  document.getElementById('irpfGroup').value=group||item?.grupo||(activeIRPFTab==='exclusivos'?'exclusiva':'isento');
  document.getElementById('irpfNature').value=item?.natureza||'';document.getElementById('irpfSource').value=item?.fonte_pagadora||'';
  document.getElementById('irpfDocument').value=item?.documento||'';document.getElementById('irpfValue').value=item?.valor||'';
  document.getElementById('irpfDate').value=item?.data||localISODate();document.getElementById('irpfNotes').value=item?.observacoes||'';
  document.getElementById('taxModalTitle').textContent=item?'Editar rendimento':'Adicionar rendimento';
  document.getElementById('taxModalSubtitle').textContent='Informe os dados conforme o documento da fonte pagadora.';
 }else{
  darfForm.reset();document.getElementById('darfId').value=item?.id||'';
  const today=localISODate();document.getElementById('darfCompetence').value=item?.competencia||today.slice(0,7);
  document.getElementById('darfCode').value=item?.codigo||'';document.getElementById('darfValue').value=item?.valor||'';
  document.getElementById('darfDue').value=item?.vencimento||'';document.getElementById('darfStatus').value=item?.status||'pendente';
  document.getElementById('darfPaidDate').value=item?.pago_em||'';document.getElementById('darfNotes').value=item?.observacoes||'';
  document.getElementById('taxModalTitle').textContent=item?'Editar DARF':'Cadastrar DARF';
  document.getElementById('taxModalSubtitle').textContent='Registre os dados que você já conferiu na guia.';
  toggleDarfPaidDate();
 }
 back.style.display='flex';
}
function closeTaxModal(){document.getElementById('taxModalBack').style.display='none';document.getElementById('irpfEntryForm').reset();document.getElementById('darfForm').reset()}
function toggleDarfPaidDate(){const paid=document.getElementById('darfStatus').value==='pago';document.getElementById('darfPaidDateField').classList.toggle('hidden',!paid);document.getElementById('darfPaidDate').required=paid}
function editIRPFIncome(id){const item=(irpfData.rendimentos||[]).find(x=>Number(x.id)===Number(id));if(item)openTaxModal('irpf',item.grupo,item)}
async function deleteIRPFIncome(id){if(!await appConfirm('Excluir rendimento','Este rendimento será removido permanentemente.','Excluir rendimento'))return;try{await api(`/api/irpf/lancamentos/${id}`,{method:'DELETE'});await loadIRPF();toast('Rendimento excluído.')}catch(e){toast(e.message)}}
function exportIRPF(){
 const rows=[['Grupo','Ativo / Natureza','Classe / Fonte pagadora','Documento','Quantidade','Custo médio','Valor','Data']];
 (irpfData.posicoes||[]).forEach(x=>rows.push(['Bens e direitos',x.ticker,labels[x.tipo]||x.tipo,'',x.quantidade,x.preco_medio,x.custo_total,'31/12/'+irpfData.ano]));
 (irpfData.rendimentos||[]).forEach(x=>rows.push([x.grupo==='isento'?'Rendimentos isentos':'Tributação exclusiva',x.natureza,x.fonte_pagadora,x.documento||'', '', '', x.valor,x.data]));
 (irpfData.operacoes||[]).forEach(x=>rows.push([x.grupo==='fiis'?'Operações em FIIs':'Operações comuns',x.mes,'Vendas registradas','','','',x.resultado,'']));
 downloadTaxCSV(`irpf-ano-base-${irpfData.ano||'atual'}.csv`,rows);
}
async function loadDARFs(){
 setupTaxYearFilters();const year=document.getElementById('darfYearFilter')?.value||new Date().getFullYear();
 try{const data=await api(`/api/darfs?ano=${encodeURIComponent(year)}`);darfItems=data.itens||[];renderDARFs();}
 catch(e){toast(e.message)}
}
function renderDARFs(){
 const filter=document.getElementById('darfStatusFilter')?.value||'todos';const today=localISODate();
 const pending=darfItems.filter(x=>x.status==='pendente');const paid=darfItems.filter(x=>x.status==='pago');
 const overdue=pending.filter(x=>String(x.vencimento)<today);
 const stats=[['Total registrado',brl(darfItems.reduce((s,x)=>s+Number(x.valor||0),0)),'Todas as guias do ano'],['Pendente',brl(pending.reduce((s,x)=>s+Number(x.valor||0),0)),`${pending.length} guia(s)`],['Pago',brl(paid.reduce((s,x)=>s+Number(x.valor||0),0)),`${paid.length} guia(s)`],['Vencido',String(overdue.length),'Pendências após o vencimento']];
 document.getElementById('darfStats').innerHTML=stats.map(([label,value,detail],i)=>`<div class="card stat"><div class="statlabel">${label}</div><div class="statvalue ${i===3&&overdue.length?'red':''}">${value}</div><div class="statdetail"><span>${detail}</span></div></div>`).join('');
 const rows=darfItems.filter(x=>filter==='todos'||x.status===filter);
 document.getElementById('darfRows').innerHTML=rows.length?rows.map(item=>`<tr><td>${monthBR(item.competencia)}</td><td>${escapeHTML(item.codigo)}</td><td>${dateBR(item.vencimento)}</td><td>${item.pago_em?dateBR(item.pago_em):'—'}</td><td>${brl(item.valor)}</td><td><span class="tax-status ${item.status}">${item.status==='pago'?'Pago':'Pendente'}</span></td><td>${escapeHTML(item.observacoes||'—')}</td><td><button class="tax-action" onclick="editDARF(${item.id})">Editar</button><button class="tax-action danger" onclick="deleteDARF(${item.id})">Excluir</button></td></tr>`).join(''):rowEmpty(8,'Nenhum DARF cadastrado para os filtros selecionados.');
}
function editDARF(id){const item=darfItems.find(x=>Number(x.id)===Number(id));if(item)openTaxModal('darf',null,item)}
async function deleteDARF(id){if(!await appConfirm('Excluir registro de DARF','Este registro será removido permanentemente.','Excluir registro'))return;try{await api(`/api/darfs/${id}`,{method:'DELETE'});await loadDARFs();toast('Registro excluído.')}catch(e){toast(e.message)}}
function exportDARFs(){const rows=[['Competência','Código','Valor','Vencimento','Pago em','Status','Observações'],...darfItems.map(x=>[x.competencia,x.codigo,x.valor,x.vencimento,x.pago_em,x.status,x.observacoes])];downloadTaxCSV(`darfs-${document.getElementById('darfYearFilter').value}.csv`,rows)}

document.getElementById('irpfEntryForm').addEventListener('submit',async event=>{
 event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));const id=data.id;delete data.id;
 try{await api(id?`/api/irpf/lancamentos/${id}`:'/api/irpf/lancamentos',{method:id?'PUT':'POST',body:JSON.stringify(data)});closeTaxModal();await loadIRPF();toast('Rendimento salvo.');}
 catch(e){toast(e.message)}
});
document.getElementById('darfForm').addEventListener('submit',async event=>{
 event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));const id=data.id;delete data.id;
 try{await api(id?`/api/darfs/${id}`:'/api/darfs',{method:id?'PUT':'POST',body:JSON.stringify(data)});closeTaxModal();await loadDARFs();toast('DARF salvo.');}
 catch(e){toast(e.message)}
});
setupTaxYearFilters();

function exportCSV(){let rows=[['Ativo','Classe','Quantidade','Preço médio','Custo total'],...state.itens.map(i=>[i.ticker,labels[i.tipo]||i.tipo,i.quantidade,i.preco_medio,i.investido])];let csv=rows.map(r=>r.join(';')).join('\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='posicoes-irpf.csv';a.click();URL.revokeObjectURL(a.href)}
function toast(msg){let el=document.getElementById('toast');if(!el){el=document.createElement('div');el.id='toast';el.style='position:fixed;bottom:22px;right:22px;background:#303745;border:1px solid #515b6c;padding:12px 16px;border-radius:9px;z-index:20;box-shadow:0 8px 30px #0008';document.body.append(el)}el.textContent=msg;el.style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.style.display='none',3200)}

// Distribuição-alvo da carteira: configuração persistida no SQLite.
async function loadDistribution(){
 try{
  const data=await api('/api/distribuicao');
  distributionItems=(data.itens||[]).map(x=>({nome:x.nome,percentual:Number(x.percentual)}));
  renderDistribution();syncAssetTypeOptions();renderPositionGroups(state.itens||[],'summaryGroups',true);
 }catch(e){toast(e.message);}
}
function distributionSum(){return distributionItems.reduce((sum,x)=>sum+Number(x.percentual||0),0);}
function renderDistribution(){
 const colors=distributionItems.map((_,i)=>distributionColors[i%distributionColors.length]);
 const total=distributionSum();
 const totalEl=document.getElementById('distributionTotal');
 totalEl.textContent='Total '+total.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
 totalEl.classList.toggle('invalid',total>100.001||Math.abs(total-100)>.001);
 document.getElementById('distributionRows').innerHTML=distributionItems.map((item,i)=>`
 <div class="distribution-row">
  <div class="distribution-name"><span class="distribution-dot" style="background:${colors[i]}"></span>${escapeHTML(item.nome)}</div>
  <button type="button" aria-label="Diminuir ${escapeHTML(item.nome)}" onclick="adjustDistribution(${i},-1)" ${item.percentual<=0?'disabled':''}>−</button>
  <div class="distribution-value">${Number(item.percentual).toLocaleString('pt-BR',{maximumFractionDigits:2})}%</div>
  <button type="button" aria-label="Aumentar ${escapeHTML(item.nome)}" onclick="adjustDistribution(${i},1)" ${item.percentual>=100?'disabled':''}>＋</button>
  <button type="button" class="distribution-remove" aria-label="Remover ${escapeHTML(item.nome)}" onclick="removeDistributionClass(${i})">×</button>
 </div>`).join('')||'<div class="empty">Adicione uma classe para começar.</div>';
 chart('targetAllocationChart','doughnut',{
  labels:distributionItems.map(x=>x.nome),
  datasets:[{data:distributionItems.map(x=>x.percentual),backgroundColor:colors,borderWidth:0,hoverOffset:5}]
 },{cutout:'66%',plugins:{legend:{position:'bottom',labels:{color:'#b8c1ce',boxWidth:10,padding:14,font:{size:11}}}}});
 updateDistributionOptions();syncAssetTypeOptions();renderDistributionComparison();
 document.getElementById('distributionStatus').textContent='Alterações ainda não salvas';
}
function renderDistributionComparison(){
 const host=document.getElementById('distributionComparisonRows');if(!host)return;
 const actual=state.alocacao||{};const total=Object.values(actual).reduce((sum,value)=>sum+Number(value||0),0);
 const desired=new Map((distributionItems||[]).map(item=>[categoryKeyFromName(item.nome)||String(item.nome),item]));
 const keys=new Set([...Object.keys(actual),...desired.keys()]);
 const rows=[...keys].map(key=>{
  const item=desired.get(key);const value=Number(actual[key]||0);const current=total?value/total*100:0;const ideal=Number(item?.percentual||0);return {key,name:item?.nome||labels[key]||key,value,current,ideal,diff:current-ideal};
 }).sort((a,b)=>b.value-a.value);
 const totalLabel=document.getElementById('distributionPortfolioTotal');if(totalLabel)totalLabel.textContent=`Patrimônio atual: ${brl(total)}`;
 host.innerHTML=rows.length?rows.map(row=>`<tr><td>${escapeHTML(row.name)}</td><td>${brl(row.value)}</td><td>${pct(row.current)}</td><td>${pct(row.ideal)}</td><td class="deviation ${Math.abs(row.diff)<0.05?'':row.diff>0?'red':'green'}">${row.diff>0?'+':''}${pct(row.diff)}</td></tr>`).join(''):rowEmpty(5,'Ainda não há valores na carteira.');
}
function adjustDistribution(index,delta){
 if(!distributionItems[index])return;
 const current=Number(distributionItems[index].percentual)||0;
 if(delta>0 && distributionSum()+delta>100){toast('A distribuição não pode ultrapassar 100%.');return;}
 const next=Math.max(0,Math.min(100,current+delta));
 distributionItems[index].percentual=next;renderDistribution();
}
function updateDistributionOptions(){
 const select=document.getElementById('newAssetClass');
 const all=['Ações','FIIs','Renda Fixa','ETFs','ETFs Internacionais','BDRs','Criptomoedas','Stocks','REITs','Tesouro Direto','Fundos de Investimentos','Outros'];
 const existing=new Set(distributionItems.map(x=>categoryKeyFromName(x.nome)).filter(Boolean));
 const available=all.filter(name=>!existing.has(categoryKeyFromName(name)));
 select.innerHTML='<option value="">Selecione uma classe para adicionar</option>'+available.map(name=>`<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
}
function addDistributionClass(){
 const select=document.getElementById('newAssetClass'),name=select.value.trim();
 if(!name)return;
 if(distributionItems.some(x=>categoryKeyFromName(x.nome)===categoryKeyFromName(name))){toast('Essa classe já está na distribuição.');return;}
 distributionItems.push({nome:name,percentual:0});select.value='';renderDistribution();
}
function removeDistributionClass(index){
 if(distributionItems.length<=1){toast('Mantenha pelo menos uma classe de ativo.');return;}
 distributionItems.splice(index,1);renderDistribution();
}
async function saveDistribution(){
 const total=distributionSum();
 if(Math.abs(total-100)>.001){toast('A soma precisa ser exatamente 100%. Total atual: '+total.toLocaleString('pt-BR')+'%.');return;}
 if(!await appConfirm('Salvar distribuição da carteira','A distribuição-alvo das classes de ativos será atualizada.','Salvar distribuição'))return;
 try{
  const data=await api('/api/distribuicao',{method:'PUT',body:JSON.stringify({itens:distributionItems})});
  distributionItems=(data.itens||[]).map(x=>({nome:x.nome,percentual:Number(x.percentual)}));
  renderDistribution();syncAssetTypeOptions();renderPositionGroups(state.itens||[],'summaryGroups',true);document.getElementById('distributionStatus').textContent='Salvo com sucesso';
  toast('Distribuição salva com sucesso.');
 }catch(e){toast(e.message);}
}


async function exportOperations(){
 try{
  const response=await fetch('/api/operacoes/exportar');
  if(!response.ok){let message='Não foi possível exportar os lançamentos.';try{const data=await response.json();message=data.erro||message}catch(e){}throw new Error(message)}
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='Lonely-Wallet-Lancamentos-B3.xlsx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  toast('Planilha de lançamentos exportada.');
 }catch(error){toast(error.message||'Falha ao exportar lançamentos.')}
}
async function autoSyncPluggyOnPageLoad(){
 // Evita consultar a Pluggy em todo F5. Cada conexão é atualizada no máximo
 // uma vez a cada 30 minutos; o servidor também aplica o mesmo bloqueio.
 const intervalMs=30*60*1000;
 try{
  const stateData=await api('/api/pluggy/state',{skipAutoRefresh:true});
  const items=stateData.items||[];
  if(!items.length)return;
  const now=Date.now();
  const hasDueItem=items.some(item=>{
   if(!item.last_synced_at)return true;
   const last=Date.parse(item.last_synced_at);
   return !Number.isFinite(last)||(now-last)>=intervalMs;
  });
  if(!hasDueItem)return;
  const configured=await api('/api/integracoes',{skipAutoRefresh:true});
  const pluggy=(configured.providers||[]).find(p=>p.id==='pluggy'||p.provider==='pluggy');
  if(pluggy&&(!pluggy.configured||pluggy.enabled===false))return;
  const result=await api('/api/pluggy/sync',{method:'POST',body:'{}',skipAutoRefresh:true});
  if(result&&result.ok!==false&&Number(result.items||0)>0){
   await refresh();
   if(document.getElementById('pluggyState'))await loadPluggyState();
   toast('Pluggy atualizada. Novos ativos e movimentações foram verificados sem duplicar lançamentos.');
  }
 }catch(error){console.warn('Sincronização automática Pluggy:',error.message||error)}
}

updateDocumentIdentity('resumo');
refresh();loadDistribution();autoSyncPluggyOnPageLoad();

// Preferências locais: tema claro/escuro e ocultação de valores.
function applyTheme(light){
 document.body.classList.toggle('light-theme',!!light);
 const b=document.getElementById('themeToggle');
 if(b){
  b.title=light?'Ativar tema escuro':'Ativar tema claro';
  b.setAttribute('aria-label',b.title);
  b.innerHTML=light
   ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></svg>'
   : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
 }
}
function toggleTheme(){
 const light=!document.body.classList.contains('light-theme');
 try{localStorage.setItem('lonelyWalletLightTheme',light?'1':'0')}catch(e){}
 applyTheme(light);
}
function applyPrivacy(hidden){
 document.body.classList.toggle('privacy-mode',!!hidden);
 const b=document.getElementById('privacyToggle');
 if(b){
  b.title=hidden?'Mostrar valores':'Ocultar valores';
  b.setAttribute('aria-label',b.title);
  b.innerHTML=hidden
   ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.2 0 2.3-.2 3.3-.6"/></svg>'
   : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
 }
}
function togglePrivacy(){
 const hidden=!document.body.classList.contains('privacy-mode');
 try{localStorage.setItem('lonelyWalletPrivacyMode',hidden?'1':'0')}catch(e){}
 applyPrivacy(hidden);
}
try{
 applyTheme(localStorage.getItem('lonelyWalletLightTheme')==='1');
 applyPrivacy(localStorage.getItem('lonelyWalletPrivacyMode')==='1');
}catch(e){applyTheme(false);applyPrivacy(false)}


let appConfirmResolver=null;
function appConfirm(title,message,acceptLabel='Confirmar exclusão'){
 document.getElementById('appConfirmTitle').textContent=title;
 document.getElementById('appConfirmMessage').textContent=message;
 document.getElementById('appConfirmAccept').textContent=acceptLabel;
 document.getElementById('appConfirmBack').style.display='flex';
 return new Promise(resolve=>{appConfirmResolver=resolve;});
}
function resolveAppConfirm(value){document.getElementById('appConfirmBack').style.display='none';if(appConfirmResolver){const resolve=appConfirmResolver;appConfirmResolver=null;resolve(!!value);}}
let managedOperations=[];
function openOperationManager(){document.getElementById('operationManagerBack').style.display='flex';loadOperationManager();}
function closeOperationManager(){document.getElementById('operationManagerBack').style.display='none';}
async function loadOperationManager(){
 const summary=document.getElementById('operationManagerSummary');summary.textContent='Carregando lançamentos…';
 try{
  const data=await api('/api/operacoes',{skipAutoRefresh:true});managedOperations=data.itens||[];
  const type=document.getElementById('operationManagerType'),previous=type.value;
  const types=[...new Set(managedOperations.map(x=>String(x.tipo||'outros').toLowerCase()))].sort((a,b)=>(labels[a]||a).localeCompare(labels[b]||b,'pt-BR'));
  type.innerHTML='<option value="">Todas as classes</option>'+types.map(t=>`<option value="${escapeHTML(t)}">${escapeHTML(labels[t]||t)}</option>`).join('');
  if(types.includes(previous))type.value=previous;
  onOperationManagerTypeChange();
 }catch(e){summary.textContent=e.message||'Não foi possível carregar os lançamentos.';}
}
function onOperationManagerTypeChange(){
 const type=document.getElementById('operationManagerType').value,ticker=document.getElementById('operationManagerTicker'),previous=ticker.value;
 const assets=[...new Set(managedOperations.filter(x=>!type||String(x.tipo||'outros').toLowerCase()===type).map(x=>String(x.ticker||'').toUpperCase()))].sort();
 ticker.innerHTML='<option value="">Todos os ativos</option>'+assets.map(t=>`<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');
 if(assets.includes(previous))ticker.value=previous;
 renderOperationManagerRows();
}
function getManagedOperationSelection(){const type=document.getElementById('operationManagerType').value,ticker=document.getElementById('operationManagerTicker').value;return managedOperations.filter(x=>(!type||String(x.tipo||'outros').toLowerCase()===type)&&(!ticker||String(x.ticker||'').toUpperCase()===ticker));}
function renderOperationManagerRows(){
 const rows=getManagedOperationSelection(),host=document.getElementById('operationManagerRows');
 document.getElementById('operationManagerSummary').textContent=`${rows.length} lançamento(s) encontrados · ${document.getElementById('operationManagerType').value?(labels[document.getElementById('operationManagerType').value]||document.getElementById('operationManagerType').value):'Todas as classes'} · ${document.getElementById('operationManagerTicker').value||'Todos os ativos'}`;
 if(!rows.length){host.innerHTML='<div class="empty">Nenhum lançamento encontrado para os filtros selecionados.</div>';return;}
 const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 host.innerHTML=`<table class="data"><thead><tr><th>Data</th><th>Classe</th><th>Ativo</th><th>Operação</th><th>Quantidade</th><th>Preço</th><th>Total</th><th></th></tr></thead><tbody>${rows.slice().sort((a,b)=>String(b.data_execucao||b.data).localeCompare(String(a.data_execucao||a.data))).map(o=>`<tr><td>${escapeHTML(String(o.data_execucao||o.data||'').replace('T',' ').slice(0,16))}</td><td>${escapeHTML(labels[String(o.tipo||'outros').toLowerCase()]||o.tipo||'Outros')}</td><td><b>${escapeHTML(o.ticker)}</b></td><td class="${o.lado==='compra'?'green':'red'}">${o.lado==='compra'?'Compra':'Venda'}</td><td>${operationQuantity(o.quantidade)}</td><td>${money(o.preco)}</td><td>${money(Number(o.quantidade||0)*Number(o.preco||0)+Number(o.custos||0))}</td><td>${isPluggyOperation(o)?'<span class="tag" title="Importado pela Pluggy e protegido contra alterações">Somente leitura</span>':`<div class="toolbar"><button class="ghost" type="button" onclick="closeOperationManager();editOperation(${Number(o.id)})">Editar</button><button class="ghost" type="button" onclick="removeManagedOperation(${Number(o.id)})">Excluir</button></div>`}</td></tr>`).join('')}</tbody></table>`;
}
async function removeManagedOperation(id){
 const op=managedOperations.find(x=>Number(x.id)===Number(id));if(op&&isPluggyOperation(op)){toast('Lançamentos importados pela Pluggy são somente leitura.');return;}
 if(!await appConfirm('Excluir lançamento','Confirma a exclusão deste lançamento? A operação será removida do histórico e dos cálculos da carteira.','Excluir lançamento'))return;
 try{await api('/api/operacoes/'+id,{method:'DELETE',skipAutoRefresh:true});await refresh();await loadOperationManager();toast('Lançamento excluído.');}catch(e){toast(e.message||'Falha ao excluir lançamento.');}
}
async function confirmDeleteManaged(scope){
 const type=document.getElementById('operationManagerType').value,ticker=document.getElementById('operationManagerTicker').value;
 if(scope==='ativo'&&(!type||!ticker)){toast('Selecione uma classe e um ativo para excluir os lançamentos.');return;}
 const selected=scope==='todas'?managedOperations:getManagedOperationSelection().filter(x=>String(x.tipo||'').toLowerCase()===type&&String(x.ticker||'').toUpperCase()===ticker);const rows=selected.filter(x=>!isPluggyOperation(x));
 if(!rows.length){toast('Não há lançamentos para excluir.');return;}
 const title=scope==='todas'?'Excluir todos os lançamentos':'Excluir lançamentos do ativo';
 const protectedCount=selected.length-rows.length;const message=scope==='todas'?`Você está prestes a excluir ${rows.length} lançamento(s) editável(is). ${protectedCount} lançamento(s) da Pluggy serão preservados como somente leitura. Esta ação não pode ser desfeita.`:`Você está prestes a excluir ${rows.length} lançamento(s) editável(is) de ${ticker}. ${protectedCount} lançamento(s) da Pluggy serão preservados. Esta ação não pode ser desfeita.`;
 if(!await appConfirm(title,message,scope==='todas'?'Excluir tudo':'Excluir lançamentos'))return;
 try{const result=await api('/api/operacoes/gerenciar',{method:'DELETE',body:JSON.stringify(scope==='todas'?{escopo:'todas'}:{escopo:'ativo',tipo,ticker}),skipAutoRefresh:true});await refresh();await loadOperationManager();toast(`${result.excluidos||0} lançamento(s) excluído(s).`);}catch(e){toast(e.message||'Não foi possível excluir os lançamentos.');}
}

let b3PreviewReady=false;
async function openB3ImportsManager(){
 const back=document.getElementById('b3ImportsManagerBack');back.style.display='flex';
 await loadB3Imports();
}
function closeB3ImportsManager(){document.getElementById('b3ImportsManagerBack').style.display='none';}
async function loadB3Imports(){
 const host=document.getElementById('b3ImportsList');host.textContent='Carregando importações…';
 try{
  const data=await api('/api/importar-b3/lotes',{skipAutoRefresh:true});
  const batches=data.lotes||[],legacy=data.legados||[];
  if(!batches.length&&!legacy.length){host.innerHTML='<div class="empty">Nenhuma planilha B3 importada foi registrada.</div>';return;}
  const fmtDate=v=>{const d=new Date(v);return isNaN(d)?escapeHTML(v||''):d.toLocaleString('pt-BR');};
  host.innerHTML=`${batches.map(b=>`<div class="pluggy-item-row"><div><strong>${escapeHTML(b.arquivo||'Planilha B3')}</strong><div class="mini">${fmtDate(b.importado_em)} · ${Number(b.operacoes||0)} lançamentos · ${Number(b.proventos||0)} proventos · ${Number(b.registros||0)} registros rastreados</div></div><button class="ghost" type="button" onclick="deleteB3ImportBatch('${b.id}')">Excluir importação</button></div>`).join('')}${legacy.length?`<div class="section"><strong>Importações anteriores</strong><p class="mini">Estas importações foram feitas antes do histórico por arquivo. O banco não guardou o nome original nem o vínculo seguro de cada registro, por isso aparecem na lista, mas não podem ser apagadas individualmente por esta tela.</p>${legacy.map(b=>`<div class="pluggy-item-row"><div><strong>Planilha B3 antiga</strong><div class="mini">${fmtDate(b.importado_em)} · ${Number(b.operacoes||0)} lançamentos · ${Number(b.proventos||0)} proventos · ${Number(b.registros||0)} registros</div></div><span class="api-status-pill warning">Exclusão indisponível</span></div>`).join('')}</div>`:''}`;
 }catch(e){host.textContent=e.message||'Não foi possível carregar o histórico.';}
}
async function deleteB3ImportBatch(id){
 if(!await appConfirm('Excluir importação da B3','Esta ação excluirá a importação e os lançamentos/proventos criados exclusivamente por ela. Não pode ser desfeita.','Excluir importação'))return;
 try{const r=await api(`/api/importar-b3/lotes/${encodeURIComponent(id)}`,{method:'DELETE',skipAutoRefresh:true});await refresh();await loadB3Imports();toast(`Importação excluída: ${r.operacoes||0} lançamentos e ${r.proventos||0} proventos.`);}catch(e){toast(e.message||'Não foi possível excluir a importação.');}
}
function openB3Import(){
 const back=document.getElementById('b3ImportBack');back.style.display='flex';
 document.getElementById('b3File').value='';document.getElementById('b3Preview').textContent='Nenhum arquivo selecionado.';
 document.getElementById('b3ConfirmButton').classList.add('hidden');document.getElementById('b3PreviewButton').classList.remove('hidden');b3PreviewReady=false;
}
function closeB3Import(){document.getElementById('b3ImportBack').style.display='none';}
async function sendB3File(mode){
 const file=document.getElementById('b3File').files[0];if(!file)throw new Error('Selecione uma planilha .xlsx da B3.');
 const form=new FormData();form.append('arquivo',file);form.append('modo',mode);
 const response=await fetch('/api/importar-b3',{method:'POST',body:form});
 const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.erro||data.error||data.mensagem||'Falha ao processar a planilha.');return data;
}
async function previewB3File(){
 const button=document.getElementById('b3PreviewButton');button.disabled=true;button.textContent='Analisando…';
 try{
  const r=await sendB3File('preview');
  document.getElementById('b3Preview').innerHTML=`<div class="grid stats"><div class="panel"><strong>${r.total}</strong><div class="mini">Movimentações reconhecidas</div></div><div class="panel"><strong>${r.operacoes}</strong><div class="mini">Lançamentos novos</div></div><div class="panel"><strong>${r.proventos}</strong><div class="mini">Proventos novos</div></div><div class="panel"><strong>${r.duplicados}</strong><div class="mini">Duplicados</div></div></div><p class="mini">Compras e vendas serão adicionadas em Lançamentos. Dividendos, JCP e rendimentos serão adicionados em Proventos. Eventos sem valor negociado ou sem classificação segura serão ignorados.</p>`;
  b3PreviewReady=r.novos>0;document.getElementById('b3ConfirmButton').classList.toggle('hidden',!b3PreviewReady);
  toast(r.novos?'Prévia pronta. Confira os números antes de importar.':'Nenhuma movimentação nova para importar.');
 }catch(e){toast(e.message);document.getElementById('b3Preview').textContent=e.message;}
 finally{button.disabled=false;button.textContent='Analisar planilha';}
}
async function confirmB3Import(){
 if(!b3PreviewReady)return;
 if(!await appConfirm('Confirmar importação da B3','Os lançamentos e proventos identificados na prévia serão gravados na carteira. Duplicidades reconhecidas serão ignoradas.','Importar dados'))return;
 const button=document.getElementById('b3ConfirmButton');button.disabled=true;button.textContent='Importando…';
 try{
  const r=await sendB3File('importar');
  await refresh();
  document.getElementById('b3Preview').innerHTML=`<strong>Importação concluída!</strong><p>${r.operacoes} lançamentos e ${r.proventos} proventos adicionados. ${r.duplicados} duplicados ignorados.</p>`;
  button.classList.add('hidden');b3PreviewReady=false;toast('Planilha B3 importada com sucesso.');
 }catch(e){toast(e.message);}
 finally{button.disabled=false;button.textContent='Confirmar importação';}
}


/* v2.0.62 — dropdowns customizados para todos os filtros do projeto */
(function(){
 const selector='select:not([multiple]):not([data-native-select])';
 let openMenu=null;
 const proto=HTMLSelectElement.prototype;
 const valueDescriptor=Object.getOwnPropertyDescriptor(proto,'value');
 if(valueDescriptor && valueDescriptor.configurable && !proto.__lwValuePatched){
  Object.defineProperty(proto,'value',{
   configurable:true,enumerable:valueDescriptor.enumerable,
   get(){return valueDescriptor.get.call(this)},
   set(v){valueDescriptor.set.call(this,v);this.__lwSyncCustom?.();}
  });
  proto.__lwValuePatched=true;
 }
 const indexDescriptor=Object.getOwnPropertyDescriptor(proto,'selectedIndex');
 if(indexDescriptor && indexDescriptor.configurable && !proto.__lwIndexPatched){
  Object.defineProperty(proto,'selectedIndex',{
   configurable:true,enumerable:indexDescriptor.enumerable,
   get(){return indexDescriptor.get.call(this)},
   set(v){indexDescriptor.set.call(this,v);this.__lwSyncCustom?.();}
  });
  proto.__lwIndexPatched=true;
 }
 function closeMenu(){
  if(!openMenu)return;
  openMenu.menu.remove();
  openMenu.button.setAttribute('aria-expanded','false');
  openMenu=null;
 }
 window.__lwCloseSelectMenu=closeMenu;
 function enhance(select){
  if(!select || select.dataset.lwCustomSelect==='1' || select.classList.contains('hidden') || select.disabled || select.multiple || select.closest('[hidden]'))return;
  const rect=select.getBoundingClientRect();
  if(!rect.width || !rect.height)return;
  const style=getComputedStyle(select);
  const wrap=document.createElement('span');
  wrap.className='lw-select-wrap';
  wrap.style.width=rect.width+'px';
  wrap.style.height=rect.height+'px';
  wrap.style.minWidth=(style.minWidth!=='0px' && style.minWidth!=='auto')?style.minWidth:'0';
  select.parentNode.insertBefore(wrap,select);
  wrap.appendChild(select);
  select.dataset.lwCustomSelect='1';
  select.classList.add('lw-select-native-source');
  const button=document.createElement('button');
  button.type='button';
  button.className='lw-select-button';
  button.setAttribute('aria-haspopup','listbox');
  button.setAttribute('aria-expanded','false');
  const label=document.createElement('span');
  label.className='lw-select-label';
  const arrow=document.createElement('span');
  arrow.className='lw-select-chevron';
  arrow.setAttribute('aria-hidden','true');
  button.append(label,arrow);
  wrap.appendChild(button);
  function selectedOption(){
   return select.options[select.selectedIndex] || select.options[0];
  }
  function sync(){
   const option=selectedOption();
   label.textContent=option?option.textContent.trim():'Selecionar';
   button.disabled=select.disabled;
   button.removeAttribute("title");
   wrap.style.height=(select.getBoundingClientRect().height||rect.height)+'px';
  }
  select.__lwSyncCustom=sync;
  select.addEventListener('change',sync);
  const observer=new MutationObserver(sync);
  observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['label','value','disabled','selected']});
  function renderMenu(){
   closeMenu();
   sync();
   const menu=document.createElement('div');
   menu.className='lw-select-menu';
   menu.setAttribute('role','listbox');
   menu.setAttribute('aria-label',select.getAttribute('aria-label')||label.textContent||'Opções');
   Array.from(select.options).forEach((option,index)=>{
    if(option.disabled && !option.value)return;
    const item=document.createElement('button');
    item.type='button';
    item.className='lw-select-option'+(option.value===select.value?' active':'');
    item.setAttribute('role','option');
    item.setAttribute('aria-selected',option.value===select.value?'true':'false');
    item.textContent=option.textContent.trim();
    item.disabled=option.disabled;
    item.addEventListener('click',()=>{
     select.value=option.value;
     select.dispatchEvent(new Event('change',{bubbles:true}));
     closeMenu();
     button.focus();
    });
    menu.appendChild(item);
   });
   document.body.appendChild(menu);
   const r=button.getBoundingClientRect();
   const maxHeight=Math.min(360,window.innerHeight-16);
   menu.style.left=Math.max(4,Math.min(r.left,window.innerWidth-menu.offsetWidth-4))+'px';
   menu.style.top=(r.bottom+1)+'px';
   menu.style.minWidth=r.width+'px';
   menu.style.width=r.width+'px';
   menu.style.maxHeight=maxHeight+'px';
   if(r.bottom+menu.offsetHeight>window.innerHeight-8 && r.top>menu.offsetHeight){
    menu.style.top=Math.max(4,r.top-menu.offsetHeight-1)+'px';
   }
   button.setAttribute('aria-expanded','true');
   openMenu={menu,button,select};
  }
  button.addEventListener('click',()=>{
   if(openMenu?.button===button){closeMenu();return;}
   if(typeof window.closeAllProventosMenus==='function')window.closeAllProventosMenus();
   renderMenu();
  });
  button.addEventListener('keydown',event=>{
   if(event.key==='Escape'){closeMenu();button.focus();}
   if(event.key==='ArrowDown'&&!openMenu){event.preventDefault();renderMenu();openMenu?.menu.querySelector('.active')?.focus();}
  });
  sync();
 }
 function scan(){
  document.querySelectorAll(selector).forEach(enhance);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
 const pageObserver=new MutationObserver(()=>scan());
 pageObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
 document.addEventListener('click',event=>{
  if(openMenu && !openMenu.menu.contains(event.target) && !openMenu.button.contains(event.target))closeMenu();
 });
 window.addEventListener('scroll',closeMenu,true);
 window.addEventListener('resize',closeMenu);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && typeof window.closeAllProventosMenus==='function')window.closeAllProventosMenus();
 });
})();

/* v2.0.67 — coordenação global e antecipada dos menus */
document.addEventListener('click',function(event){
 const trigger=event.target.closest(
  '#provTotalTrigger,#provChartPeriodTrigger,'+
  '#provHistoryStatusWrap .prov-history-trigger,'+
  '#provHistoryTypeWrap .prov-history-trigger,'+
  '#provHistoryAssetWrap .prov-history-trigger,'+
  '#myProvPeriodWrap .prov-history-trigger,'+
  '#myProvTypeWrap .prov-history-trigger,'+
  '#myProvAssetWrap .prov-history-trigger,'+
  '.lw-select-button'
 );
 if(!trigger)return;
 const activeTriggers=Array.from(document.querySelectorAll(
  '#provTotalTrigger[aria-expanded="true"],#provChartPeriodTrigger[aria-expanded="true"],'+
  '.prov-history-trigger[aria-expanded="true"],.lw-select-button[aria-expanded="true"]'
 ));
 const otherOpen=activeTriggers.some(openTrigger=>openTrigger!==trigger);
 const multipleOpen=activeTriggers.length>1;
 if(otherOpen||multipleOpen){
  // Executa em capture, antes do onclick do filtro recém-clicado.
  // O handler do alvo poderá então abrir apenas o menu solicitado.
  window.closeAllProventosMenus();
 }
},true);

startPluggyAutoSync();

const brl=v=>(Number(v)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const num=v=>(Number(v)||0).toLocaleString("pt-BR",{maximumFractionDigits:6});
const pct=v=>(Number(v)||0).toFixed(2).replace(".",",")+"%";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=id=>document.getElementById(id);
let cache={ativos:[],totais:{}};
function go(page){
  if(!$( "page-"+page)) page="dashboard";
  document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
  $("page-"+page).classList.remove("hidden");
  document.querySelectorAll("#nav a").forEach(a=>a.classList.toggle("active",a.dataset.page===page));
  const labels={dashboard:["VISÃO GERAL","Dashboard"],carteira:["ACOMPANHAMENTO","Carteira"],movimentacoes:["HISTÓRICO","Movimentações"],proventos:["RENDA PASSIVA","Proventos"],importar:["DADOS DA B3","Importar dados"]};
  $("eyebrow").textContent=labels[page][0]; $("page-title").textContent=labels[page][1];
  if(page==="carteira") renderCarteira(); if(page==="movimentacoes") renderMov(); if(page==="proventos") renderProv();
}
window.addEventListener("hashchange",()=>go(location.hash.slice(1)));
document.querySelectorAll("#nav a").forEach(a=>a.addEventListener("click",()=>go(a.dataset.page)));
function table(headers,rows){if(!rows.length)return '<div class="empty">Nenhum registro encontrado.</div>';return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`}
function row(cells){return `<tr>${cells.map(x=>`<td>${x}</td>`).join("")}</tr>`}
async function api(url,opts){const r=await fetch(url,opts);let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.detail||"Falha na solicitação");return d}
async function carregar(){
 try{
  const d=await api("/api/carteira");cache=d;
  const t=d.totais;
  $("totais").innerHTML=[["Total investido",t.investido],["Patrimônio atual",t.atual],["Resultado",t.lucro],["Proventos recebidos",t.proventos]].map((x,i)=>`<div class="metric"><small>${x[0]}</small><b class="${i===2?(x[1]>=0?"pos":"neg"):""}">${brl(x[1])}</b><small>${["Capital aplicado","Valor de mercado","Resultado acumulado","Renda acumulada"][i]}</small></div>`).join("");
  $("ativos-count").textContent=`${d.ativos.length} ativos`;
  $("lista").className=d.ativos.length?"asset-grid":"empty";
  $("lista").innerHTML=d.ativos.length?d.ativos.slice(0,8).map(a=>`<article class="asset"><div class="asset-top"><b>${esc(a.ticker)}</b><span class="${a.lucro>=0?"pos":"neg"}">${pct(a.lucro_pct)}</span></div><div class="asset-line">Quantidade <b>${num(a.qtd)}</b></div><div class="asset-line">Preço médio <b>${brl(a.preco_medio)}</b></div><div class="asset-line">Valor atual <b>${brl(a.valor_atual)}</b></div></article>`).join(""):'Sua carteira ainda não tem ativos cadastrados.';
 }catch(e){console.error(e);$("lista").textContent=e.message}
}
function renderCarteira(){
 const rows=cache.ativos.map(a=>row([`<b>${esc(a.ticker)}</b>`,esc(a.tipo.toUpperCase()),num(a.qtd),brl(a.preco_medio),brl(a.preco_atual),brl(a.valor_atual),`<span class="${a.lucro>=0?"pos":"neg"}">${brl(a.lucro)}</span>`]));
 $("carteira-table").innerHTML=table(["Ticker","Tipo","Quantidade","Preço médio","Cotação","Patrimônio","Resultado"],rows);
}
async function renderMov(){try{const a=await api("/api/movimentacoes");$("mov-table").innerHTML=table(["Data","Ativo","Tipo","Descrição","Qtd.","Valor"],a.map(x=>row([esc(x.data),esc(x.ticker||"—"),esc(x.tipo),esc(x.descricao),num(x.quantidade),brl(x.valor_total)])))}catch(e){$("mov-table").textContent=e.message}}
async function renderProv(){try{const a=await api("/api/proventos");$("prov-table").innerHTML=table(["Data","Ticker","Tipo","Qtd. base","Valor por cota","Total"],a.map(x=>row([esc(x.data),esc(x.ticker),esc(x.tipo),num(x.quantidade),brl(x.valor_por_cota),brl(x.valor_total||x.valor_por_cota*x.quantidade)])))}catch(e){$("prov-table").textContent=e.message}}
async function importar(input,result){
 const file=$(input).files[0];if(!file){alert("Escolha um arquivo .xlsx");return}
 const fd=new FormData();fd.append("arquivo",file);
 try{const j=await api("/api/importar",{method:"POST",body:fd});
  $(result).innerHTML=`<div class="notice"><b>Importação concluída.</b><br>${j.linhas_lidas} linhas lidas · ${j.operacoes} operações · ${j.proventos} proventos · ${j.ajustes} ajustes · ${j.transferencias} transferências preservadas · ${j.duplicadas} duplicadas ignoradas · ${j.ignoradas} eventos não contabilizados.</div>`;
  await carregar(); if(! $("page-proventos").classList.contains("hidden"))renderProv();if(! $("page-movimentacoes").classList.contains("hidden"))renderMov();
 }catch(e){$(result).innerHTML=`<div class="error">${esc(e.message)}</div>`}
}
$("btn-importar").addEventListener("click",()=>importar("arquivo","import-result"));
$("btn-importar2").addEventListener("click",()=>importar("arquivo2","import-result2"));
$("form-op").addEventListener("submit",async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.qtd=Number(f.qtd);f.preco=Number(f.preco);try{await api("/api/operacoes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(f)});e.target.reset();await carregar();alert("Operação cadastrada.")}catch(err){alert(err.message)}});
$("btn-atualizar").addEventListener("click",async()=>{try{await api("/api/atualizar-proventos",{method:"POST"});await carregar();alert("Cotações e proventos atualizados quando disponíveis.")}catch(e){alert(e.message)}});
go(location.hash.slice(1)||"dashboard");carregar();

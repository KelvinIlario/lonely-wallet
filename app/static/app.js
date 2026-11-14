const $=s=>document.querySelector(s), brl=v=>(Number(v)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}), pct=v=>(Number(v)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%", esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let state={tipo:"todos",periodo:"12m",dados:[]};
async function get(url){const r=await fetch(url);if(!r.ok)throw Error(await r.text());return r.json()}
function setPage(p){document.querySelectorAll(".page").forEach(x=>x.classList.toggle("hidden",x.id!==p));document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===p));$("#page-title").textContent=({dashboard:"Dashboard",carteira:"Carteira",movimentacoes:"Movimentações",proventos:"Proventos"})[p];location.hash=p;if(p==="movimentacoes")loadOps();if(p==="proventos")loadDividends()}
document.querySelectorAll(".nav").forEach(b=>b.addEventListener("click",()=>setPage(b.dataset.page)));
window.addEventListener("hashchange",()=>{let p=location.hash.slice(1);if(["dashboard","carteira","movimentacoes","proventos"].includes(p))setPage(p)});
function kpi(label,value,sub="",cls=""){return `<div class="kpi"><label>${label}</label><strong class="${cls}">${value}</strong><small>${sub}</small></div>`}
async function loadDashboard(){
 const d=await get(`/api/carteira?tipo=${encodeURIComponent(state.tipo)}`);state.dados=d.ativos;const t=d.totais;
 const prov=await get(`/api/proventos?tipo=${encodeURIComponent(state.tipo)}&meses=12`);
 const provTotal=prov.reduce((s,p)=>s+Number(p.valor_por_cota||0)*(d.ativos.find(a=>a.ticker===p.ticker)?.qtd||0),0);
 $("#kpis").innerHTML=kpi("Patrimônio total",brl(t.atual),"Valor de mercado")+kpi("Lucro total",brl(t.lucro),"Resultado sobre o capital",t.lucro>=0?"pos":"neg")+kpi("Proventos recebidos (12M)",brl(provTotal),"Estimativa com posição atual")+kpi("Rentabilidade",pct(t.rentabilidade),"Resultado ÷ capital aplicado",t.rentabilidade>=0?"pos":"neg");
 const sum=d.ativos.reduce((s,a)=>s+a.valor_atual,0);
 $("#asset-list").innerHTML=d.ativos.length?d.ativos.map(a=>`<div class="asset-row"><div><b>${esc(a.ticker)}</b><small>${esc(a.tipo.replace("_"," ").toUpperCase())}</small></div><div>Quantidade<br><b>${Number(a.qtd).toLocaleString("pt-BR")}</b></div><div>Valor atual<br><b>${brl(a.valor_atual)}</b></div><div>Rentabilidade<br><b class="${a.lucro>=0?"pos":"neg"}">${pct(a.lucro_pct)}</b></div></div>`).join(""):"<p class='muted'>Nenhum ativo encontrado para esse filtro.</p>";
 $("#portfolio-list").innerHTML=$("#asset-list").innerHTML;
 drawDonut(d.ativos,sum);await loadHistory();
}
function drawDonut(assets,total){
 const colors={acao:"#78b8f5",fii:"#f6d978",renda_fixa:"#39d6a0",etf:"#b79af5",cripto:"#ff9b78"};
 const groups={};assets.forEach(a=>groups[a.tipo]=(groups[a.tipo]||0)+a.valor_atual);
 let vals=Object.entries(groups).filter(x=>x[1]>0),r=80,cx=110,cy=110,circ=2*Math.PI*r,offset=0;
 let circles=vals.map(([k,v])=>{let len=total?circ*v/total:0,s=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[k]||"#9aa"}" stroke-width="28" stroke-dasharray="${len} ${circ-len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;offset+=len;return s}).join("");
 $("#donut-chart").innerHTML=vals.length?`<svg viewBox="0 0 220 220" role="img" aria-label="Distribuição por classe">${circles}<text x="110" y="105" fill="#f4f7fb" text-anchor="middle" font-size="13">Patrimônio</text><text x="110" y="125" fill="#f4f7fb" text-anchor="middle" font-size="12">${brl(total)}</text></svg><div class="legend">${vals.map(([k,v])=>`<div><i class="dot" style="background:${colors[k]||"#9aa"}"></i>${k.replace("_"," ")} <b>${(v/total*100).toFixed(1)}%</b></div>`).join("")}</div>`:"<p class='muted'>Sem posições para distribuir.</p>";
}
async function loadHistory(){
 const period=state.periodo;const h=await get(`/api/historico?periodo=${period}&tipo=${encodeURIComponent(state.tipo)}`);const data=h.dados||[];
 $("#history-note").textContent="Capital aplicado líquido (não é cotação histórica de mercado)";
 const w=700,H=240,pad=42,max=Math.max(1,...data.map(x=>x.valor)),min=Math.min(0,...data.map(x=>x.valor)),range=max-min||1;
 const bw=Math.max(8,Math.min(34,(w-2*pad)/Math.max(data.length,1)*.48));
 const bars=data.map((x,i)=>{let x0=pad+i*((w-2*pad)/Math.max(data.length,1))+3,y=H-pad-(x.valor-min)/range*(H-2*pad),height=Math.max(1,(x.valor-min)/range*(H-2*pad));return `<rect x="${x0}" y="${y}" width="${bw}" height="${height}" rx="3" fill="#2dbb83"><title>${x.mes}: ${brl(x.valor)}</title></rect><text x="${x0+bw/2}" y="${H-12}" text-anchor="middle" fill="#91a5c2" font-size="10">${x.mes.slice(5)}</text>`}).join("");
 const grid=[0,.25,.5,.75,1].map(q=>{let y=H-pad-q*(H-2*pad),v=min+q*range;return `<line x1="${pad}" x2="${w-pad}" y1="${y}" y2="${y}" stroke="#2c3a4e"/><text x="${pad-7}" y="${y+4}" text-anchor="end" fill="#91a5c2" font-size="10">${(v/1000).toFixed(0)}k</text>`}).join("");
 $("#bar-chart").innerHTML=`<svg viewBox="0 0 ${w} ${H}">${grid}${bars}</svg>`;
}
$("#asset-filter").addEventListener("change",e=>{state.tipo=e.target.value;loadDashboard()});
$("#period-filter").addEventListener("change",e=>{$("#period-chart").value=e.target.value;state.periodo=e.target.value;loadHistory()});
$("#period-chart").addEventListener("change",e=>{$("#period-filter").value=e.target.value;state.periodo=e.target.value;loadHistory()});
$("#refresh").addEventListener("click",async()=>{const b=$("#refresh");b.disabled=true;b.textContent="Atualizando...";try{await fetch("/api/atualizar-proventos",{method:"POST"});await loadDashboard()}catch(e){alert("Não foi possível atualizar: "+e.message)}finally{b.disabled=false;b.textContent="↻ Atualizar cotações"}});
async function loadOps(){let a=await get("/api/operacoes");$("#operations-list").innerHTML=a.length?a.map(o=>`<div class="operation-row"><b>${esc(o.ticker)}</b><span>${esc(o.data)}</span><span>${o.qtd} × ${brl(o.preco)}</span><span>${brl(o.qtd*o.preco)}</span></div>`).join(""):"<p class='muted'>Nenhuma movimentação cadastrada.</p>"}
$("#form-op").addEventListener("submit",async e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));f.qtd=Number(f.qtd);f.preco=Number(f.preco);let r=await fetch("/api/operacoes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(f)});if(!r.ok){alert("Erro ao salvar operação");return}e.target.reset();await loadOps();await loadDashboard()});
async function loadDividends(){let rows=await get(`/api/proventos?tipo=${state.tipo}&meses=${$("#prov-period").value}`);$("#dividends-list").innerHTML=rows.length?rows.map(p=>`<div class="dividend-row"><b>${esc(p.ticker)}</b><span>${esc(p.data)}</span><span>${esc(p.tipo||"Provento")}</span><span>${brl(p.valor_por_cota)} / cota</span></div>`).join(""):"<p class='muted'>Não há proventos cadastrados nesse período.</p>"}
$("#prov-period").addEventListener("change",loadDividends);
(async()=>{try{await loadDashboard();let p=location.hash.slice(1);setPage(["dashboard","carteira","movimentacoes","proventos"].includes(p)?p:"dashboard")}catch(e){console.error(e);alert("Erro ao carregar a carteira: "+e.message)}})();

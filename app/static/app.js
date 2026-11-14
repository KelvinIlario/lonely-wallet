const brl=v=>(v??0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const pct=v=>(v??0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%";
const cor=v=>v>=0?"pos":"neg";
async function carregar(){
 try{const r=await fetch("/api/carteira");if(!r.ok)throw Error("Falha ao carregar carteira");const d=await r.json(),t=d.totais;
 document.getElementById("totais").innerHTML=`
 <div class="metric"><small>Total investido</small><b>${brl(t.investido)}</b><span>Capital aplicado</span></div>
 <div class="metric"><small>Patrimônio atual</small><b>${brl(t.atual)}</b><span>Valor de mercado</span></div>
 <div class="metric"><small>Resultado</small><b class="${cor(t.lucro)}">${brl(t.lucro)}</b><span>${pct(t.investido?100*t.lucro/t.investido:0)} sobre o investido</span></div>
 <div class="metric"><small>Proventos recebidos</small><b>${brl(t.proventos)}</b><span>Renda acumulada</span></div>`;
 document.getElementById("qtd-ativos").textContent=`${d.ativos.length} ativos`;
 document.getElementById("lista").innerHTML=d.ativos.length?d.ativos.map(a=>`<div class="asset"><div><strong>${a.ticker}</strong><small>${a.tipo.toUpperCase()} · ${a.mercado==="BR"?"Brasil":"Exterior"}</small></div><div class="value"><small>Quantidade</small><b>${a.qtd}</b></div><div class="value"><small>Valor atual</small><b>${brl(a.valor_atual)}</b></div><div class="value"><small>Rentabilidade</small><b class="${cor(a.lucro)}">${pct(a.lucro_pct)}</b></div></div>`).join(""):'<div class="empty">Sua carteira ainda não tem ativos cadastrados.</div>';
 }catch(e){document.getElementById("lista").innerHTML=`<div class="empty">${e.message}</div>`}
}
document.getElementById("form-op").addEventListener("submit",async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.qtd=Number(f.qtd);f.preco=Number(f.preco);const r=await fetch("/api/operacoes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(f)});if(!r.ok){alert("Não foi possível salvar a operação.");return}e.target.reset();carregar()});
document.getElementById("btn-atualizar").addEventListener("click",async()=>{const b=document.getElementById("btn-atualizar");b.disabled=true;b.textContent="Atualizando…";try{await fetch("/api/atualizar-proventos",{method:"POST"});await carregar()}finally{b.disabled=false;b.textContent="↻ Atualizar cotações"}});
document.getElementById("btn-importar").addEventListener("click",async()=>{const arq=document.getElementById("arquivo").files[0],status=document.getElementById("import-status");if(!arq){alert("Selecione o Excel da B3.");return}const fd=new FormData();fd.append("arquivo",arq);const b=document.getElementById("btn-importar");b.disabled=true;b.textContent="Importando…";try{const r=await fetch("/api/importar",{method:"POST",body:fd}),j=await r.json();if(!r.ok)throw Error(j.detail||"Falha na importação");status.hidden=false;status.textContent=`Importação concluída: ${j.importadas} novos registros preservados; ${j.proventos_registrados} registros de proventos adicionados. Importar o mesmo arquivo novamente não duplica os registros. ${j.mensagem}`;await carregar()}catch(e){status.hidden=false;status.textContent=e.message;status.style.background="#351b24";status.style.color="#ffc0c8"}finally{b.disabled=false;b.textContent="Analisar e importar"}});
carregar();

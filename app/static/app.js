const brl = (v) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v) => (v ?? 0).toFixed(2) + "%";
const cor = (v) => (v >= 0 ? "pos" : "neg");

async function carregar() {
  const r = await fetch("/api/carteira");
  const d = await r.json();
  const t = d.totais;

  document.getElementById("totais").innerHTML = `
    <div class="card"><small>Investido</small><b>${brl(t.investido)}</b></div>
    <div class="card"><small>Valor atual</small><b>${brl(t.atual)}</b></div>
    <div class="card"><small>Lucro/Prejuízo</small><b class="${cor(t.lucro)}">${brl(t.lucro)}</b></div>
    <div class="card"><small>Proventos recebidos</small><b>${brl(t.proventos)}</b></div>`;

  document.getElementById("lista").innerHTML = d.ativos.map((a) => `
    <div class="ativo">
      <div class="topo"><span>${a.ticker}</span><span class="${cor(a.lucro)}">${pct(a.lucro_pct)}</span></div>
      <div class="linha"><span>Qtd ${a.qtd}</span><span>Atual ${brl(a.preco_atual)}</span></div>
      <div class="linha"><span>Preço médio ${brl(a.preco_medio)}</span><span>Menor compra ${brl(a.menor_preco)}</span></div>
      <div class="linha"><span>Lucro ${brl(a.lucro)}</span><span>Valor ${brl(a.valor_atual)}</span></div>
      <div class="linha"><span>Proventos pagos ${brl(a.proventos_recebidos)}</span><span>A receber ${brl(a.proventos_a_receber)}</span></div>
    </div>`).join("");
}

document.getElementById("form-op").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  f.qtd = parseFloat(f.qtd);
  f.preco = parseFloat(f.preco);
  await fetch("/api/operacoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(f),
  });
  e.target.reset();
  carregar();
});

document.getElementById("btn-atualizar").addEventListener("click", async () => {
  await fetch("/api/atualizar-proventos", { method: "POST" });
  carregar();
});

document.getElementById("btn-importar").addEventListener("click", async () => {
  const arq = document.getElementById("arquivo").files[0];
  if (!arq) return alert("Escolha um arquivo .xlsx");
  const fd = new FormData();
  fd.append("arquivo", arq);
  const r = await fetch("/api/importar", { method: "POST", body: fd });
  const j = await r.json();
  alert(r.ok ? `Importadas ${j.importadas} operações` : j.detail);
  carregar();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
carregar();

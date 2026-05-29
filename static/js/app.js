// ──────────────────────────────────────
// STATE
// ──────────────────────────────────────
let assets = [
  {name:"Tesouro Selic", type:"RF", initial:70, target:10},
  {name:"IVVB11",        type:"RV", initial:20, target:20},
  {name:"PETR4",         type:"RV", initial:10, target:70},
];
let heuristicMode = "admissible";
let assetCosts = {};
let lastRunData = null;
const MAX_ASSETS = 4;

// ──────────────────────────────────────
// INIT
// ──────────────────────────────────────
async function init(){
  try {
    const [costsRes, scenRes] = await Promise.all([
      fetch("/asset_costs"), fetch("/scenarios")
    ]);
    assetCosts = await costsRes.json();
    const scenarios = await scenRes.json();
    renderScenarios(scenarios);
  } catch(e){
    document.getElementById("scenarioList").innerHTML =
      `<div style="font-family:var(--mono);font-size:10px;color:var(--red)">Servidor offline. Inicie o app.py na porta 5050.</div>`;
  }
  renderAssets();
  setHeuristic("admissible");
  updatePortVis();
}

// ──────────────────────────────────────
// SCENARIOS
// ──────────────────────────────────────
let scenariosData = {};

function renderScenarios(scenarios){
  scenariosData = scenarios;
  const list = document.getElementById("scenarioList");
  list.innerHTML = "";
  Object.entries(scenarios).forEach(([key, sc]) => {
    const willDiverge = key !== "sem_divergencia";
    const btn = document.createElement("button");
    btn.className = `scenario-btn ${willDiverge ? "diverges" : ""}`;
    btn.id = `sc-${key}`;
    btn.innerHTML = `
      <div class="sb-name">
        ${sc.label}
        <span class="sb-badge">${willDiverge ? "⚡ divergência esperada" : "↔ sem divergência"}</span>
      </div>
      <div class="sb-desc">${sc.description}</div>
    `;
    btn.onclick = () => loadScenario(key, sc);
    list.appendChild(btn);
  });
}

function loadScenario(key, sc){
  document.querySelectorAll(".scenario-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById(`sc-${key}`).classList.add("active");
  assets = sc.assets.map((name, i) => ({
    name,
    type: name.includes("Tesouro") || name.includes("Selic") || name.includes("IPCA") ? "RF" : "RV",
    initial: sc.initial[i],
    target:  sc.target[i],
    customCost: null,
  }));
  document.getElementById("portfolioValue").value = sc.portfolio_value;
  document.getElementById("unitPP").value = sc.unit_pp;
  document.getElementById("tolerance").value = sc.tolerance;
  renderAssets();
  updatePortVis();
  showToast(`Cenário: ${sc.label}`, "ok");
  if(key !== "sem_divergencia") setTimeout(() => runCompare(), 300);
}

// ──────────────────────────────────────
// ASSETS
// ──────────────────────────────────────
function addAsset(){
  if(assets.length >= MAX_ASSETS){ showToast(`Máximo de ${MAX_ASSETS} ativos`,"err"); return; }
  assets.push({name:`Ativo ${assets.length+1}`, type:"RV", initial:0, target:0, customCost: null});
  renderAssets();
}
function removeAsset(i){
  if(assets.length <= 2){ showToast("Mínimo de 2 ativos","err"); return; }
  assets.splice(i,1);
  renderAssets();
}
function toggleType(i){
  assets[i].type = assets[i].type === "RF" ? "RV" : "RF";
  renderAssets();
}
function updateCost(i, val){
  const v = parseFloat(val);
  assets[i].customCost = isNaN(v) || v <= 0 ? null : v;
}

function getCostForAsset(a){
  if(a.customCost != null) return a.customCost;
  return assetCosts[a.name] ?? 40;
}

function renderAssets(){
  const list = document.getElementById("assetList");
  list.innerHTML = "";
  assets.forEach((a,i)=>{
    const cost = getCostForAsset(a);
    const card = document.createElement("div");
    card.className = "asset-card";
    card.id = `acard-${i}`;
    card.innerHTML = `
      <div class="asset-header">
        <input class="asset-name-input" value="${a.name}" 
          oninput="assets[${i}].name=this.value;updatePortVis()" 
          placeholder="Nome do ativo"/>
        <span class="cost-label">R$</span>
        <input class="cost-input" type="number" min="0.01" step="0.5" 
          value="${cost}"
          title="Custo por p.p."
          onchange="updateCost(${i},this.value)"
          oninput="updateCost(${i},this.value)"/>
        <span class="cost-label">/pp</span>
        <span class="type-badge ${a.type.toLowerCase()}" onclick="toggleType(${i})">${a.type}</span>
        <button class="remove-btn" onclick="removeAsset(${i})">×</button>
      </div>
      <div class="alloc-row">
        <div class="alloc-label"><span>Alocação atual</span><span style="color:var(--accent)">Hoje</span></div>
        <div class="alloc-controls">
          <input type="range" min="0" max="100" step="1" value="${a.initial}" oninput="syncAlloc(${i},'initial',+this.value)"/>
          <input type="number" class="num-input ii" id="init-num-${i}" min="0" max="100" value="${a.initial}" oninput="syncAlloc(${i},'initial',+this.value)"/>
          <span style="font-family:var(--mono);font-size:9px;color:var(--t3)">%</span>
        </div>
      </div>
      <div class="alloc-row">
        <div class="alloc-label"><span>Alocação alvo</span><span style="color:var(--grn)">Objetivo</span></div>
        <div class="alloc-controls">
          <input type="range" min="0" max="100" step="1" value="${a.target}" oninput="syncAlloc(${i},'target',+this.value)"/>
          <input type="number" class="num-input ti" id="targ-num-${i}" min="0" max="100" value="${a.target}" oninput="syncAlloc(${i},'target',+this.value)"/>
          <span style="font-family:var(--mono);font-size:9px;color:var(--t3)">%</span>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
  const notice = document.getElementById("maxNotice");
  notice.style.display = assets.length >= MAX_ASSETS ? "block" : "none";
  document.getElementById("addAssetBtn").style.display = assets.length >= MAX_ASSETS ? "none" : "block";
  updateSums();
  updatePortVis();
}

function syncAlloc(i,key,val){
  val = Math.max(0,Math.min(100,isNaN(val)?0:val));
  assets[i][key] = val;
  const card = document.getElementById(`acard-${i}`);
  const sliders = card.querySelectorAll('input[type=range]');
  const nums    = card.querySelectorAll('.num-input');
  if(key==='initial'){ sliders[0].value=val; nums[0].value=val; }
  else               { sliders[1].value=val; nums[1].value=val; }
  updateSums(); updatePortVis();
}

function updateSums(){
  const si = assets.reduce((s,a)=>s+a.initial,0);
  const st = assets.reduce((s,a)=>s+a.target,0);
  document.getElementById("initSum").textContent = `∑ Atual = ${si}%`;
  document.getElementById("initSum").className   = si===100 ? "ok" : "err";
  document.getElementById("targSum").textContent = `∑ Alvo = ${st}%`;
  document.getElementById("targSum").className   = st===100 ? "ok" : "err";
}

function updatePortVis(){
  ["init","targ"].forEach(k=>{

    const el = document.getElementById(`${k}Bars`);

    let html = "";

    assets.forEach((a,i)=>{

      const pct = k==="init"
        ? a.initial
        : a.target;

      html += `
        <div class="bar-item">
          <div class="bar-meta">
            <span class="bar-name">${a.name}</span>
            <span class="bar-pct">${pct}%</span>
          </div>

          <div class="bar-track">
            <div class="bar-fill bf-${i%20}" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    });

    el.innerHTML = html;
  });
}

// ──────────────────────────────────────
// RANDOMIZE STATE
// ──────────────────────────────────────
async function randomizeState(which){
  const unit_pp = parseInt(document.getElementById("unitPP").value)||10;
  const n = assets.length;
  try {
    const res = await fetch("/random_state",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({n, unit_pp})
    });
    const data = await res.json();
    const alloc = data.allocation;
    assets.forEach((a,i)=>{
      a[which] = alloc[i] || 0;
    });
    renderAssets();
    showToast(`Estado ${which==='initial'?'inicial':'alvo'} aleatorizado!`,"ok");
  } catch(e){
    // Fallback: local random
    localRandomize(which, unit_pp, n);
  }
}

function localRandomize(which, unit_pp, n){
  const steps = Math.floor(100 / unit_pp);
  let alloc = new Array(n).fill(0);
  let remaining = steps;
  for(let i=0;i<n-1;i++){
    const share = Math.max(1, Math.floor(Math.random()*(remaining-(n-i-1))));
    alloc[i] = share;
    remaining -= share;
  }
  alloc[n-1] = remaining;
  alloc = alloc.map(v=>v*unit_pp);
  // Shuffle
  for(let i=alloc.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [alloc[i],alloc[j]]=[alloc[j],alloc[i]];
  }
  assets.forEach((a,i)=>{ a[which] = alloc[i]||0; });
  renderAssets();
  showToast(`Estado ${which==='initial'?'inicial':'alvo'} aleatorizado!`,"ok");
}

// ──────────────────────────────────────
// HEURISTIC
// ──────────────────────────────────────
function setHeuristic(mode){
  heuristicMode = mode;
  document.getElementById("btnAdm").className = "h-btn"+(mode==="admissible"?" adm":"");
  document.getElementById("btnNon").className = "h-btn"+(mode==="non_admissible"?" non":"");
  const info = document.getElementById("heuristicInfo");
  if(mode==="admissible"){
    info.innerHTML = `h(n) = 0.5 × Σ|wᵢ−wᵢ*| × c<sub>min</sub><br><span style="color:var(--grn)">✓ Nunca superestima — ótimo garantido</span>`;
  } else {
    info.innerHTML = `h(n) = 40.0 × Σ|wᵢ−wᵢ*| × c<sub>min</sub><br><span style="color:var(--red)">✗ Superestima fortemente — pode descartar o ótimo</span>`;
  }
}

// ──────────────────────────────────────
// HELPERS
// ──────────────────────────────────────
function getParams(mode){
  const customCosts = {};
  assets.forEach(a=>{ if(a.customCost!=null) customCosts[a.name]=a.customCost; });
  return {
    assets:          assets.map(a=>a.name),
    initial:         assets.map(a=>a.initial),
    target:          assets.map(a=>a.target),
    portfolio_value: +document.getElementById("portfolioValue").value,
    unit_pp:         +document.getElementById("unitPP").value,
    tolerance:       +document.getElementById("tolerance").value,
    heuristic_mode:  mode || heuristicMode,
    custom_costs:    customCosts,
  };
}

function stateShort(state){
  if(state.length <= 4) return "["+state.map(v=>v+"%").join("/")+"]";
  return "["+state.slice(0,3).map(v=>v+"%").join("/")+"/…]";
}

function stateKey(state){
  return state.join('|');
}

function stateLabel(state){
  return "["+state.map((v,i)=>`${assets[i]?.name||'A'+i}:${v}%`).join(", ")+"]";
}

function loading(id){
  document.getElementById(id).innerHTML =
    `<div class="loading"><div class="ld"></div><div class="ld"></div><div class="ld"></div><span>Executando A*…</span></div>`;
}

// ──────────────────────────────────────
// RUN SINGLE
// ──────────────────────────────────────
async function runSimulation(){
  const p = getParams();
  if(p.initial.reduce((a,b)=>a+b,0)!==100||p.target.reduce((a,b)=>a+b,0)!==100){
    showToast("Alocações devem somar 100%","err"); return;
  }
  document.getElementById("runBtn").disabled = true;
  loading("pathContent");
  loading("iterContent");
  loading("treeWrapper");

  try {
    const res  = await fetch("/run",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(p)
    });
    const data = await res.json();
    if(data.error){ showToast(data.error,"err"); return; }
    lastRunData = data;

    document.getElementById("mCost").textContent  = data.solution_found ? `R$ ${data.total_cost}` : "—";
    document.getElementById("mNodes").textContent = data.nodes_expanded;
    document.getElementById("mSteps").textContent = data.solution_found ? (data.path.length-1) : "—";
    const s = document.getElementById("mStatus");
    s.textContent = data.solution_found ? "✓ ÓTIMA" : "✗ NÃO ENCONTRADA";
    s.className   = "metric-val "+(data.solution_found?"mv-green":"mv-red");
    document.getElementById("divAlert").style.display = "none";

    if(data.solution_found){
      renderPath(data, "pathContent");
    } else {
      document.getElementById("pathContent").innerHTML =
        `<div class="empty"><div class="empty-icon">✗</div><p>Sem solução no limite de iterações</p></div>`;
    }
    renderIterations(data);
    renderTree(data);
    showToast(data.solution_found?`✓ Custo: R$ ${data.total_cost}`:"Sem solução", data.solution_found?"ok":"err");
  } catch(e){
    showToast("Erro de conexão com o servidor Python (porta 5050)","err");
  } finally {
    document.getElementById("runBtn").disabled = false;
  }
}

// ──────────────────────────────────────
// RUN COMPARE
// ──────────────────────────────────────
async function runCompare(){
  const p = getParams();
  if(p.initial.reduce((a,b)=>a+b,0)!==100||p.target.reduce((a,b)=>a+b,0)!==100){
    showToast("Alocações devem somar 100%","err"); return;
  }
  document.getElementById("compareBtn").disabled = true;
  loading("compareContent");
  switchTab("cmp", document.querySelector('.tab:nth-child(2)'));

  try {
    const res  = await fetch("/compare",{method:"POST",headers:{"Content-Type":"application/json"},body: JSON.stringify(p)});
    const data = await res.json();
    renderCompare(data);
    updateDivergenceAlert(data);
  } catch(e){
    showToast("Erro de conexão","err");
  } finally {
    document.getElementById("compareBtn").disabled = false;
  }
}

// ──────────────────────────────────────
// DIVERGENCE ALERT
// ──────────────────────────────────────
function updateDivergenceAlert(data){
  const alert = document.getElementById("divAlert");
  alert.style.display = "flex";
  if(data.diverged){
    alert.className = "div-alert yes";
    document.getElementById("divIcon").textContent = "⚠";
    document.getElementById("divTitle").textContent = "Divergência de custo detectada!";
    document.getElementById("divBody").innerHTML =
      `A heurística não-admissível encontrou uma solução <strong>subótima</strong>. `+
      `A* admissível garantiu o custo mínimo real; a não-admissível superestimou h(n) `+
      `e podou prematuramente o caminho mais barato.`;
    document.getElementById("divDelta").textContent =
      `+R$ ${data.cost_delta} a mais (${data.suboptimal_pct}% acima do ótimo)`;
  } else {
    alert.className = "div-alert no";
    const adm = data.admissible, non = data.non_admissible;
    document.getElementById("divIcon").textContent = "◎";
    document.getElementById("divTitle").textContent = "Sem divergência de custo neste cenário";
    const admOk = adm?.solution_found, nonOk = non?.solution_found;
    document.getElementById("divBody").innerHTML =
      admOk && nonOk
        ? `Ambas as heurísticas chegaram ao mesmo custo (R$ ${adm.total_cost}).`
        : `Uma ou ambas as buscas não encontraram solução.`;
    document.getElementById("divDelta").textContent = "";
  }
}

// ──────────────────────────────────────
// RENDER PATH
// ──────────────────────────────────────
function renderPath(data, elId){
  const el = document.getElementById(elId);
  let html = `<div class="tbl-wrap"><table>
    <thead><tr>
      <th>Passo</th><th>Estado</th><th>Ação</th>
      <th title="Custo acumulado real">g(n)</th>
      <th title="Custo estimado restante">h(n) est.</th>
      <th title="Função de avaliação">f(n)=g+h</th>
    </tr></thead><tbody>`;
  data.path.forEach((step,i)=>{
    const iterData = data.iterations_log?.find(it=>stateKey(it.state)===stateKey(step.state));
    const h   = iterData ? iterData.h.toFixed(2) : "—";
    const fv  = iterData ? iterData.f.toFixed(2) : "—";
    const isGoal = i===data.path.length-1;
    html += `<tr class="${isGoal?'goal-row':''}">
      <td style="color:var(--t3)">${i}</td>
      <td class="state-cell">${stateShort(step.state)}</td>
      <td style="color:var(--t2);font-size:9px">${step.action}</td>
      <td class="g-cell">R$ ${step.g}</td>
      <td style="color:var(--t3)">R$ ${h}</td>
      <td class="f-cell">R$ ${fv}</td>
    </tr>`;
  });
  html += `</tbody></table></div>
  <div class="path-footer">
    <span class="ok">✓ Custo total: R$ ${data.total_cost}</span>
    <span>${data.path.length-1} transações</span>
    <span>${data.nodes_expanded} nós expandidos</span>
    <span style="color:${data.heuristic_mode==='admissible'?'var(--grn)':'var(--red)'}">
      h×${data.heuristic_factor} — ${data.heuristic_mode==='admissible'?'Admissível ✓':'Não-admissível ✗'}
    </span>
  </div>`;
  el.innerHTML = html;
}

// ──────────────────────────────────────
// RENDER COMPARE
// ──────────────────────────────────────
function renderCompare(data){
  const el  = document.getElementById("compareContent");
  const adm = data.admissible, non = data.non_admissible;
  const admCost = adm?.solution_found ? `R$ ${adm.total_cost}` : "—";
  const nonCost = non?.solution_found ? `R$ ${non.total_cost}` : "—";

  let warnAdm = `<div class="warn-box ok">✓ Heurística admissível garante solução ótima (f×0.5 — nunca superestima).</div>`;
  let warnNon = "";
  if(data.diverged){
    warnNon = `<div class="warn-box sub">⚠ Solução subótima detectada!<br>
      Custo real: R$ ${non.total_cost} vs ótimo: R$ ${adm.total_cost}<br>
      Diferença: +R$ ${data.cost_delta} (+${data.suboptimal_pct}%)<br>
      h×40 superestimou — o caminho ótimo foi podado prematuramente.</div>`;
  } else if(adm?.solution_found && non?.solution_found){
    warnNon = `<div class="warn-box eq">Mesmo custo neste cenário — mas a otimalidade NÃO é garantida teoricamente.</div>`;
  }

  let diffHtml = "";
  if(adm?.solution_found && non?.solution_found) diffHtml = buildPathDiff(adm.path, non.path);

  el.innerHTML = `
    <div class="cmp-grid">
      <div class="cmp-col cadm">
        <div class="cmp-title">✓ Admissível — h(n) × 0.5</div>
        <div class="cmp-formula">h(n) = 0.5 × Σ|wᵢ−wᵢ*| × c<sub>min</sub><br>→ Nunca superestima — ótimo garantido</div>
        <div class="cmp-m metric"><div class="metric-label">Custo Total</div><div class="metric-val mv-green">${admCost}</div></div>
        <div class="cmp-m metric"><div class="metric-label">Nós Expandidos</div><div class="metric-val mv-yel">${adm?.nodes_expanded ?? '—'}</div></div>
        ${warnAdm}
        ${adm?.solution_found ? pathMini(adm.path,'adm') : '<p style="color:var(--red);font-family:var(--mono);font-size:10px;margin-top:8px">Sem solução</p>'}
      </div>
      <div class="cmp-col cno">
        <div class="cmp-title">✗ Não-admissível — h(n) × 40</div>
        <div class="cmp-formula">h(n) = 40 × Σ|wᵢ−wᵢ*| × c<sub>min</sub><br>→ Superestima fortemente — ótimo NÃO garantido</div>
        <div class="cmp-m metric"><div class="metric-label">Custo Total</div><div class="metric-val ${data.diverged?'mv-red':'mv-green'}">${nonCost}</div></div>
        <div class="cmp-m metric"><div class="metric-label">Nós Expandidos</div><div class="metric-val mv-yel">${non?.nodes_expanded ?? '—'}</div></div>
        ${warnNon}
        ${non?.solution_found ? pathMini(non.path,'non') : '<p style="color:var(--red);font-family:var(--mono);font-size:10px;margin-top:8px">Sem solução</p>'}
      </div>
    </div>
    ${diffHtml}
    ${buildDeepAnalysis(data)}
  `;
}

// ──────────────────────────────────────
// DEEP ANALYSIS
// ──────────────────────────────────────
function buildDeepAnalysis(data){
  const adm = data.admissible;
  const non = data.non_admissible;
  if(!adm || !non) return "";

  const admOk = adm.solution_found, nonOk = non.solution_found;
  const admNodes = adm.nodes_expanded ?? 0;
  const nonNodes = non.nodes_expanded ?? 0;
  const admCost  = adm.total_cost ?? 0;
  const nonCost  = non.total_cost ?? 0;

  // Node efficiency
  let nodeMsg = "";
  if(admNodes > nonNodes){
    nodeMsg = `<strong class="hl-yel">A heurística não-admissível expandiu ${admNodes - nonNodes} nós a menos</strong>
    — isso acontece porque h×40 direciona agressivamente para o objetivo, podando 
    ramos inteiros da árvore (incluindo o ótimo). É "rápida" mas não confiável.`;
  } else if(admNodes < nonNodes){
    nodeMsg = `<strong class="hl-green">A heurística admissível expandiu ${nonNodes - admNodes} nós a menos</strong>
    — raro, mas pode ocorrer quando a superestimação da não-admissível gera ciclos ou revisões 
    de nós desnecessárias.`;
  } else {
    nodeMsg = `Ambas expandiram exatamente <strong class="hl-blue">${admNodes} nós</strong>. 
    Isso sugere um espaço de estados pequeno onde a heurística não altera a ordem de exploração.`;
  }

  // Why diverge or not
  let whyMsg = "";
  if(data.diverged){
    const costs = assets.map(a => ({name:a.name, cost: getCostForAsset(a)}));
    const maxCostAsset = costs.reduce((a,b)=>a.cost>b.cost?a:b);
    const minCostAsset = costs.reduce((a,b)=>a.cost<b.cost?a:b);
    const costRatio = (maxCostAsset.cost / minCostAsset.cost).toFixed(1);
    whyMsg = `
      <p class="analysis-text">A divergência ocorreu porque:</p>
      <ul style="margin:8px 0 0 16px;font-size:11px;color:var(--t2);line-height:2;">
        <li><strong>Assimetria de custos extrema</strong>: ${minCostAsset.name} (R$${minCostAsset.cost}/pp) 
            vs ${maxCostAsset.name} (R$${maxCostAsset.cost}/pp) — razão ${costRatio}×</li>
        <li><strong>h×40 superestimou fortemente</strong> o custo restante a partir de certos nós, 
            tornando o f(n) de caminhos baratos <em>aparentemente caro</em></li>
        <li><strong>O A* não-admissível descartou prematuramente</strong> nós com g pequeno 
            mas h superestimado, assumindo que eram piores do que realmente eram</li>
        <li><strong>O resultado subótimo (+R$ ${data.cost_delta}, +${data.suboptimal_pct}%)</strong> 
            é exatamente o custo de abandonar a garantia de optimalidade</li>
      </ul>`;
  } else if(admOk && nonOk){
    whyMsg = `
      <p class="analysis-text">Não houve divergência porque:</p>
      <ul style="margin:8px 0 0 16px;font-size:11px;color:var(--t2);line-height:2;">
        <li><strong>Espaço de estados pequeno</strong> com poucos caminhos alternativos — ambas as heurísticas 
            chegam ao mesmo nó objetivo pela mesma rota</li>
        <li><strong>Uniformidade de custos</strong> ou poucos ativos: com 2 ativos, existe apenas 
            1 caminho possível, então h×40 não tem "caminhos alternativos" para descartar</li>
        <li><strong>Coincidência de ordenação</strong>: mesmo que h×40 superestime, a superestimação 
            é <em>uniformemente</em> aplicada, não alterando a ordem relativa dos nós</li>
        <li>Use os cenários com <strong>4+ ativos e custos assimétricos</strong> para forçar divergência</li>
      </ul>`;
  }

  // Steps comparison
  let stepsMsg = "";
  if(admOk && nonOk){
    const admSteps = adm.path.length - 1;
    const nonSteps = non.path.length - 1;
    if(admSteps !== nonSteps){
      stepsMsg = `<p class="analysis-text">A heurística admissível usou <strong class="hl-green">${admSteps} transações</strong> 
      vs <strong class="hl-red">${nonSteps} transações</strong> da não-admissível. 
      ${admSteps < nonSteps 
        ? 'O caminho ótimo é mais curto — a não-admissível seguiu uma rota desnecessariamente longa.'
        : 'A não-admissível encontrou um caminho mais curto em passos, mas com custo maior — priorizou número de transações em vez de custo real.'}</p>`;
    }
  }

  // c_min context
  const allCosts = assets.map(a => getCostForAsset(a));
  const cMin = Math.min(...allCosts);
  const cMax = Math.max(...allCosts);

  return `
  <div class="analysis-block">
    <div class="analysis-title">Análise aprofundada — por que os resultados ${data.diverged ? 'divergiram' : 'convergiram'}</div>
    
    <div class="fact-grid">
      <div class="fact-box">
        <div class="fact-val">R$${cMin}</div>
        <div class="fact-lbl">c_min (base de h)</div>
      </div>
      <div class="fact-box">
        <div class="fact-val">R$${cMax}</div>
        <div class="fact-lbl">c_max</div>
      </div>
      <div class="fact-box">
        <div class="fact-val">${(cMax/cMin).toFixed(1)}×</div>
        <div class="fact-lbl">razão de assimetria</div>
      </div>
    </div>

    <div class="analysis-section" style="margin-top:14px;">
      <h4>Comportamento das heurísticas</h4>
      <div class="analysis-text">
        A heurística admissível usa fator <strong>0.5</strong>, gerando 
        <strong class="hl-green">h(n) ≤ h*(n)</strong> (custo real) — isso é a condição de admissibilidade. 
        O A* com h admissível expande nós em ordem crescente de f(n)=g+h e 
        <strong>nunca descarta o caminho ótimo</strong>, pois h nunca infla artificialmente f(n) de boas soluções.
        <br><br>
        A heurística não-admissível usa fator <strong>40.0</strong>, gerando 
        <strong class="hl-red">h(n) >> h*(n)</strong>. Isso faz o algoritmo "parecer" que nós com 
        baixo g-custo ainda têm muito custo restante, levando-o a preferir nós subótimos que parecem 
        "mais próximos" do objetivo segundo h.
      </div>
    </div>

    <div class="analysis-section">
      <h4>Eficiência de exploração</h4>
      <div class="analysis-text">${nodeMsg}</div>
    </div>

    <div class="analysis-section">
      <h4>Causa da ${data.diverged ? 'divergência' : 'convergência'}</h4>
      ${whyMsg}
    </div>

    ${stepsMsg ? `<div class="analysis-section"><h4>Número de transações</h4>${stepsMsg}</div>` : ''}

    <div class="analysis-section">
      <h4>Lição para o investidor</h4>
      <div class="analysis-text">
        ${data.diverged
          ? `<strong class="hl-red">Usar uma heurística não-admissível neste portfólio custaria 
             R$ ${data.cost_delta} a mais (${data.suboptimal_pct}%)</strong> desnecessariamente. 
             Em portfólios reais, com ativos de custos muito diferentes (ex: Tesouro vs criptomoedas), 
             a garantia de optimalidade do A* admissível representa <strong>economia direta</strong>.`
          : `Neste cenário, ambas as abordagens chegaram ao mesmo custo. Porém, a 
             <strong class="hl-green">garantia matemática</strong> do A* admissível é independente do cenário — 
             ele sempre encontrará o ótimo, enquanto o não-admissível é uma aposta. 
             Use sempre a heurística admissível em decisões financeiras reais.`}
      </div>
    </div>
  </div>`;
}

function pathMini(path, side){
  const color = side==='adm' ? 'var(--grn)' : 'var(--red)';
  let html = `<div style="font-family:var(--mono);font-size:9px;margin-top:10px;">`;
  path.forEach((step,i)=>{
    const isGoal = i===path.length-1;
    html += `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--bd);">
      <span style="color:${isGoal?color:'var(--accent)'};font-size:9px">${stateShort(step.state)}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t3);font-size:8px">${step.action}</span>
      <span style="color:var(--yel);white-space:nowrap">R$${step.g}</span>
    </div>`;
  });
  html += `</div>`;
  return html;
}

// ──────────────────────────────────────
// PATH DIFF
// ──────────────────────────────────────
function buildPathDiff(admPath, nonPath){
  const admStates = admPath.map(s=>stateKey(s.state));
  const nonStates = nonPath.map(s=>stateKey(s.state));
  let divergeIdx = -1;
  const minLen = Math.min(admPath.length, nonPath.length);
  for(let i=0;i<minLen;i++){
    if(admStates[i]!==nonStates[i]){ divergeIdx=i; break; }
  }
  if(divergeIdx === -1 && admPath.length === nonPath.length){
    return `<div class="path-diff"><div class="diff-title">Análise passo a passo — caminhos idênticos</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--t3);padding:10px">
        Ambas as heurísticas seguiram exatamente o mesmo caminho neste cenário.
      </div></div>`;
  }
  let html = `<div class="path-diff">
    <div class="diff-title">Análise passo a passo — onde os caminhos divergem</div>`;
  const sharedLen = divergeIdx === -1 ? minLen : divergeIdx;
  for(let i=0;i<sharedLen;i++){
    const step = admPath[i];
    html += `<div class="diff-row shared">
      <span class="diff-step">#${i}</span>
      <span class="diff-state">${stateShort(step.state)}</span>
      <span class="diff-action">${step.action}</span>
      <span class="diff-g">g=${step.g}</span>
      <span class="diff-tag tag-shared">ambos</span>
    </div>`;
  }
  if(divergeIdx !== -1){
    html += `<div style="padding:8px 0;font-family:var(--mono);font-size:9px;color:var(--yel);text-align:center;">
      ── divergência no passo ${divergeIdx} ──</div>`;
    admPath.slice(divergeIdx).forEach((step,j)=>{
      html += `<div class="diff-row adm-only">
        <span class="diff-step">#${divergeIdx+j}</span>
        <span class="diff-state">${stateShort(step.state)}</span>
        <span class="diff-action">${step.action}</span>
        <span class="diff-g">g=${step.g}</span>
        <span class="diff-tag tag-adm">✓ adm</span>
      </div>`;
    });
    nonPath.slice(divergeIdx).forEach((step,j)=>{
      html += `<div class="diff-row non-only">
        <span class="diff-step">#${divergeIdx+j}</span>
        <span class="diff-state">${stateShort(step.state)}</span>
        <span class="diff-action">${step.action}</span>
        <span class="diff-g">g=${step.g}</span>
        <span class="diff-tag tag-non">✗ não-adm</span>
      </div>`;
    });
  }
  html += `</div>`;
  return html;
}

// ──────────────────────────────────────
// RENDER ITERATIONS
// ──────────────────────────────────────
function renderIterations(data){
  const el = document.getElementById("iterContent");
  if(!data.iterations_log||!data.iterations_log.length){
    el.innerHTML="<div class='empty'><p>Nenhuma iteração registrada</p></div>"; return;
  }
  let html = `<div class="iter-log">`;
  data.iterations_log.forEach((it,idx)=>{
    html += `<div class="iter-entry">
      <div class="iter-header" onclick="toggleIter(${idx})">
        <div class="iter-n">#${it.iteration}</div>
        <div class="iter-state">${stateShort(it.state)}</div>
        <div class="iter-action">${it.action}</div>
        <div class="iter-f">f=${it.f.toFixed(2)}</div>
        <span style="font-family:var(--mono);font-size:9px;color:var(--t3);margin-left:4px">▸</span>
      </div>
      <div class="iter-body" id="ib-${idx}">
        <div class="iter-vals">
          <span>g = <span style="color:var(--yel)">R$${it.g}</span></span>
          <span>h = <span style="color:var(--t2)">R$${it.h.toFixed(2)}</span></span>
          <span>f = <span style="color:var(--accent)">R$${it.f.toFixed(2)}</span></span>
        </div>
        <div class="iter-lists">
          <div class="list-box">
            <h5 class="ol-lbl">OPEN (${it.open_list.length})</h5>
            <div class="list-items">
              ${!it.open_list.length
                ? '<div style="font-family:var(--mono);font-size:9px;color:var(--t3)">∅</div>'
                : it.open_list.map(o=>`<div class="list-item"><span class="li-state">${stateShort(o.state)}</span><span class="li-fgh">f=${o.f} g=${o.g}</span></div>`).join('')}
            </div>
          </div>
          <div class="list-box">
            <h5 class="cl-lbl">CLOSED (${it.closed_list.length})</h5>
            <div class="list-items">
              ${!it.closed_list.length
                ? '<div style="font-family:var(--mono);font-size:9px;color:var(--t3)">∅</div>'
                : it.closed_list.map(c=>`<div class="list-item"><span class="li-state">${stateShort(c.state)}</span><span class="li-fgh">g=${c.g}</span></div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
  });
  html += `</div>`;
  el.innerHTML = html;
}

// ──────────────────────────────────────
// RENDER TREE (Canvas-based)
// ──────────────────────────────────────
function renderTree(data){
  const el = document.getElementById("treeWrapper");
  if(!data || !data.iterations_log || data.iterations_log.length === 0){
    el.innerHTML = `<div class="empty"><div class="empty-icon">◎</div><p>Execute o algoritmo para visualizar a árvore</p></div>`;
    return;
  }

  const log = data.iterations_log;
  const pathStates = data.solution_found
    ? new Set(data.path.map(p=>stateKey(p.state)))
    : new Set();

  // Build tree structure from log
  // Each log entry has state, action (which implies parent state)
  const nodeMap = new Map(); // state_key -> node info
  const edges   = [];

  // initial node (g=0)
  const initKey = stateKey(data.path ? data.path[0].state : log[0].state);
  nodeMap.set(initKey, {key: initKey, state: log[0] ? log[0].state : [], g:0, h:0, f:0, depth:0, isGoal:false, isPath: pathStates.has(initKey)});

  // Build from iterations
  log.forEach((it, idx) => {
    const key = stateKey(it.state);
    if(!nodeMap.has(key)){
      nodeMap.set(key, {key, state: it.state, g: it.g, h: it.h, f: it.f, depth: 0, isGoal: false, isPath: pathStates.has(key)});
    } else {
      const n = nodeMap.get(key);
      n.g = it.g; n.h = it.h; n.f = it.f;
    }
    // Children: look at open_list items introduced at this iteration
    (it.generated_children || []).forEach(o=>{
      const oKey = stateKey(o.state);

      if(!nodeMap.has(oKey)){
        nodeMap.set(oKey, {
          key:oKey,
          state:o.state,
          g:o.g,
          h:o.h || 0,
          f:o.f,
          depth:0,
          isGoal:false,
          isPath:pathStates.has(oKey)
        });
      }

      edges.push({from:key,to:oKey});
    });
  });

  // Mark goal
  if(data.solution_found){
    const goalKey = stateKey(data.path[data.path.length-1].state);
    if(nodeMap.has(goalKey)) nodeMap.get(goalKey).isGoal = true;
  }

  // Assign depths via BFS from init
  // Assign depths via BFS from init
  const depthMap = new Map();
  depthMap.set(initKey, 0);

  const queue = [initKey];

  // cria lista de adjacência UMA vez
  const adj = new Map();

  edges.forEach(e => {
    if(!adj.has(e.from)){
      adj.set(e.from, []);
    }

    adj.get(e.from).push(e.to);
  });

  // BFS correto
  while(queue.length){
    const cur = queue.shift();
    const d = depthMap.get(cur);

    (adj.get(cur) || []).forEach(next => {

      if(!depthMap.has(next)){
        depthMap.set(next, d + 1);
        queue.push(next);
      }

    });
  }

  nodeMap.forEach((n,k)=>{
    n.depth = depthMap.get(k) || 0;
  });

  // Layout: group by depth
  const maxDepth = Math.max(...[...nodeMap.values()].map(n=>n.depth));
  const byDepth = new Map();
  nodeMap.forEach(n=>{
    if(!byDepth.has(n.depth)) byDepth.set(n.depth, []);
    byDepth.get(n.depth).push(n);
  });

  const NODE_W = 80, NODE_H = 36, H_GAP = 16, V_GAP = 60;
  const maxPerRow = Math.max(...[...byDepth.values()].map(a=>a.length));
  const canvasW = Math.max(700, maxPerRow * (NODE_W + H_GAP) + 40);
  const canvasH = (maxDepth + 1) * (NODE_H + V_GAP) + 40;

  // Assign x,y positions
  nodeMap.forEach(n=>{
    const row = byDepth.get(n.depth);
    const idx = row.indexOf(n);
    const rowW = row.length * (NODE_W + H_GAP) - H_GAP;
    n.x = (canvasW - rowW) / 2 + idx * (NODE_W + H_GAP);
    n.y = 20 + n.depth * (NODE_H + V_GAP);
  });

  el.innerHTML = `
    <div class="tree-controls">

  <div class="tree-btn-group">

    <button class="tree-ctrl-btn" onclick="zoomTree(-0.2)" title="Diminuir zoom">
      −
    </button>

    <button class="tree-ctrl-btn" onclick="zoomTree(0.2)" title="Aumentar zoom">
      +
    </button>

    <button class="tree-ctrl-btn center" onclick="centerTree()" title="Centralizar árvore">
      ⊙
    </button>

    <button class="tree-ctrl-btn reset" onclick="resetTreeZoom()" title="Resetar zoom">
      ↺
    </button>

  </div>

  <span class="tree-stats">
    ${nodeMap.size} nós · ${edges.length} arestas
  </span>

</div>
    <div class="tree-container" id="treeCanvasWrap">
      <canvas id="treeCanvas"></canvas>
    </div>
    <div class="tree-legend">
      <div class="tree-legend-item"><div class="tl-dot" style="background:#5eb8fa"></div><span>Nó explorado</span></div>
      <div class="tree-legend-item"><div class="tl-dot" style="background:#34d399"></div><span>Caminho ótimo</span></div>
      <div class="tree-legend-item"><div class="tl-dot" style="background:#fbbf24"></div><span>Estado objetivo</span></div>
      <div class="tree-legend-item"><div class="tl-dot" style="background:#a78bfa"></div><span>Nó inicial</span></div>
    </div>`;

  window._treeData = {nodeMap, edges, canvasW, canvasH};
  window._treeZoom = 1.0;
  drawTree();
}

function centerTree(){

  const wrap = document.getElementById("treeCanvasWrap");

  if(!wrap) return;

  wrap.scrollTo({
    left: (wrap.scrollWidth - wrap.clientWidth) / 2,
    top: 0,
    behavior: "smooth"
  });

}

function zoomTree(delta){
  window._treeZoom = Math.max(0.3, Math.min(3, (window._treeZoom||1)+delta));
  drawTree();
}
function resetTreeZoom(){
  window._treeZoom = 1.0;
  drawTree();
}

function drawTree(){
  const canvas = document.getElementById("treeCanvas");
  if(!canvas || !window._treeData) return;
  const {nodeMap, edges, canvasW, canvasH} = window._treeData;
  const z = window._treeZoom || 1;
  canvas.width  = canvasW * z;
  canvas.height = canvasH * z;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(z, z);
  ctx.clearRect(0, 0, canvasW, canvasH);

  const pathEdgeSet = new Set();
  // Draw edges
  ctx.lineWidth = 1;
  edges.forEach(e=>{
    const from = nodeMap.get(e.from), to = nodeMap.get(e.to);
    if(!from || !to) return;
    const isPathEdge = from.isPath && to.isPath;
    ctx.beginPath();
    ctx.moveTo(from.x + 40, from.y + 18);
    ctx.lineTo(to.x + 40, to.y + 18);
    ctx.strokeStyle = isPathEdge ? "rgba(52,211,403,.8)" : "rgba(42,61,90,.7)";
    ctx.lineWidth   = isPathEdge ? 2 : 1;
    ctx.stroke();
  });

  // Draw nodes
  nodeMap.forEach(n=>{
    const isInit = n.depth === 0;
    let fill, stroke;
    if(n.isGoal)      { fill="#1a3a28"; stroke="#34d399"; }
    else if(isInit)   { fill="#2d1f5e"; stroke="#a78bfa"; }
    else if(n.isPath) { fill="#0f2a1a"; stroke="#34d399"; }
    else              { fill="#111827"; stroke="#2a3d5a"; }

    ctx.beginPath();
    roundRect(ctx, n.x, n.y, 80, 36, 6);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = n.isGoal || n.isPath ? 2 : 1;
    ctx.stroke();

    // State label
    ctx.font = "bold 8px 'Red Hat Mono', monospace";
    ctx.fillStyle = n.isGoal ? "#34d399" : n.isPath ? "#86efac" : "#8aaad8";
    ctx.textAlign = "center";
    const label = n.state.length<=3
      ? n.state.map(v=>v+"%").join("/")
      : n.state.slice(0,2).map(v=>v+"%").join("/")+"/…";
    ctx.fillText(label, n.x+40, n.y+14);

    // f value
    ctx.font = "8px 'Red Hat Mono', monospace";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`f=${(n.f||0).toFixed(0)}`, n.x+40, n.y+26);

    if(n.isGoal){
      ctx.font = "bold 8px sans-serif";
      ctx.fillStyle = "#34d399";
      ctx.fillText("✓ GOAL", n.x+40, n.y+34+4);
    }
  });
}

function roundRect(ctx, x, y, w, h, r){
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

// ──────────────────────────────────────
// UI HELPERS
// ──────────────────────────────────────
function switchTab(name, btn){
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  if(btn) btn.classList.add('active');
  if(name==='tree') setTimeout(drawTree, 50);
}
function toggleIter(idx){
  document.getElementById(`ib-${idx}`).classList.toggle('open');
}
function showToast(msg,type="ok"){
  const t=document.createElement("div");
  t.className=`toast ${type}`;t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300);},3000);
}

init();
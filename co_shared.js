// ── CriptoOpciones Lab — Módulo Compartido ────────────────────────────────
// Funciones compartidas entre todas las páginas

// Black-Scholes
function normCDF(x){const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;const s=x<0?-1:1;x=Math.abs(x)/Math.sqrt(2);const t=1/(1+p*x);const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);return 0.5*(1+s*y);}
function normPDF(x){return Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI)}
function bs(S,K,T,r,sigma,tipo){
  if(T<=0||sigma<=0||S<=0||K<=0)return{precio:tipo==='call'?Math.max(0,S-K):Math.max(0,K-S),delta:0,gamma:0,theta:0,vega:0};
  const d1=(Math.log(S/K)+(r+0.5*sigma*sigma)*T)/(sigma*Math.sqrt(T));
  const d2=d1-sigma*Math.sqrt(T);
  let precio,delta,theta;
  if(tipo==='call'){precio=S*normCDF(d1)-K*Math.exp(-r*T)*normCDF(d2);delta=normCDF(d1);theta=(-(S*normPDF(d1)*sigma)/(2*Math.sqrt(T))-r*K*Math.exp(-r*T)*normCDF(d2))/365;}
  else{precio=K*Math.exp(-r*T)*normCDF(-d2)-S*normCDF(-d1);delta=normCDF(d1)-1;theta=(-(S*normPDF(d1)*sigma)/(2*Math.sqrt(T))+r*K*Math.exp(-r*T)*normCDF(-d2))/365;}
  return{precio,delta,gamma:normPDF(d1)/(S*sigma*Math.sqrt(T)),theta,vega:(S*normPDF(d1)*Math.sqrt(T))/100};
}
function interp(x,xs,ys){if(x<=xs[0])return ys[0];if(x>=xs[xs.length-1])return ys[ys.length-1];let lo=0,hi=xs.length-1;while(hi-lo>1){const m=(lo+hi)>>1;xs[m]<=x?lo=m:hi=m;}return ys[lo]+(ys[hi]-ys[lo])*(x-xs[lo])/(xs[hi]-xs[lo]);}
function fmt(v,d=2){return(v>=0?'$':'-$')+Math.abs(v).toLocaleString('es',{minimumFractionDigits:d,maximumFractionDigits:d})}
function fmtPct(v,d=1){return v.toFixed(d)+'%'}

// Estado global persistente entre páginas
const COState={
  get exchange(){return localStorage.getItem('co_exchange')||'Bybit'},
  set exchange(v){localStorage.setItem('co_exchange',v)},
  get activo(){return localStorage.getItem('co_activo')||'BTC'},
  set activo(v){localStorage.setItem('co_activo',v)},
  get spot(){return parseFloat(localStorage.getItem('co_spot')||'77000')},
  set spot(v){localStorage.setItem('co_spot',v)},
  get iv(){return parseFloat(localStorage.getItem('co_iv')||'45')},
  set iv(v){localStorage.setItem('co_iv',v)},
  get dte(){return parseFloat(localStorage.getItem('co_dte')||'7')},
  set dte(v){localStorage.setItem('co_dte',v)},
  get legs(){try{return JSON.parse(localStorage.getItem('co_legs')||'[]')}catch{return[]}},
  set legs(v){localStorage.setItem('co_legs',JSON.stringify(v))},
  get rfr(){return parseFloat(localStorage.getItem('co_rfr')||'5')/100},
};

// Rangos históricos de IV por activo (52 semanas aproximados)
const IV_RANGES = {
  BTC: {min: 38, max: 120},
  ETH: {min: 30, max: 110},
  SOL: {min: 45, max: 180},
  BNB: {min: 25, max: 90},
};

// Calcular IVR correcto usando histórico conocido
function calcIVR(ivActual, activo){
  const range = IV_RANGES[activo] || {min:30, max:120};
  const ivr = ((ivActual - range.min) / (range.max - range.min)) * 100;
  return Math.max(0, Math.min(100, ivr));
}

// Fetch precio
async function fetchSpot(exchange,activo){
  try{
    if(exchange==='Bybit'){
      const r=await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${activo}USDT`);
      return parseFloat((await r.json()).result.list[0].lastPrice);
    }else{
      const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${activo}USDT`);
      return parseFloat((await r.json()).price);
    }
  }catch{return null;}
}

// Fetch opciones
async function fetchOptions(exchange,activo){
  try{
    if(exchange==='Bybit'){
      const r=await fetch(`https://api.bybit.com/v5/market/tickers?category=option&baseCoin=${activo}`);
      const list=(await r.json()).result?.list||[];
      return list.map(o=>{
        const p=o.symbol.split('-');
        return{symbol:o.symbol,expiry:p[1],strike:+p[2],tipo:p[3]==='C'?'call':'put',
          delta:+o.delta||0,iv:+(o.markIv||0)*100,bid:+(o.bid1Price||0),ask:+(o.ask1Price||0),
          mark:+(o.markPrice||0),volume:+(o.volume24h||0),oi:+(o.openInterest||0),
          theta:+(o.theta||0),vega:+(o.vega||0),gamma:+(o.gamma||0)};
      });
    }else{
      const r=await fetch(`https://eapi.binance.com/eapi/v1/ticker?symbol=${activo}USDT`);
      const list=await r.json();
      return (Array.isArray(list)?list:[]).map(o=>{
        const p=o.symbol.split('-');
        return{symbol:o.symbol,expiry:p[0],strike:+p[1],tipo:p[2]==='C'?'call':'put',
          delta:+o.delta||0,iv:+(o.impliedVolatility||0)*100,bid:+(o.bidPrice||0),ask:+(o.askPrice||0),
          mark:+(o.markPrice||0),volume:+(o.volume||0),oi:+(o.openInterest||0),
          theta:0,vega:0,gamma:0};
      });
    }
  }catch{return[];}
}

// Expected Move
function expectedMove(S,iv,T){return S*(iv/100)*Math.sqrt(T);}

// Probability of Touch
function probTouch(S,K,r,sigma,T){
  if(T<=0||sigma<=0)return 0;
  const d=(Math.log(K/S)+(r-0.5*sigma*sigma)*T)/(sigma*Math.sqrt(T));
  const d2=(Math.log(K/S)-(r-0.5*sigma*sigma)*T)/(sigma*Math.sqrt(T));
  return(normCDF(-d)+Math.exp(2*r*Math.log(K/S)/(sigma*sigma))*normCDF(d2))*100;
}

// CSS base compartido
const CO_CSS=`
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0d0d14;color:#c8cfe0;min-height:100vh;display:flex;flex-direction:column}
/* NAV */
nav{background:#13131f;border-bottom:1px solid #1e2035;padding:0;display:flex;align-items:center;flex-shrink:0;height:46px;position:sticky;top:0;z-index:100}
.nav-logo{padding:0 16px;font-size:14px;font-weight:700;white-space:nowrap}
.nav-logo .c{color:#38bdf8}.nav-logo .o{color:#e2e8f0}.nav-logo .l{color:#475569;font-size:11px}
.nav-links{display:flex;height:100%;flex:1}
.nav-link{display:flex;align-items:center;padding:0 14px;font-size:12px;color:#475569;text-decoration:none;border-bottom:2px solid transparent;transition:all 0.15s;white-space:nowrap}
.nav-link:hover{color:#94a3b8;background:#0d0d14}
.nav-link.active{color:#38bdf8;border-bottom-color:#38bdf8;font-weight:600}
.nav-spacer{flex:1}
.nav-price{padding:0 10px;font-size:12px;color:#38bdf8;font-weight:600;border-left:1px solid #1e2035;display:flex;align-items:center;gap:6px}
.nav-ivr{padding:0 10px;font-size:11px;border-left:1px solid #1e2035}
.nav-exchange{padding:0 10px;font-size:11px;color:#475569;border-left:1px solid #1e2035}
.nav-btn{margin:0 8px;background:#1a1a2e;border:1px solid #2a2a45;border-radius:4px;padding:4px 10px;font-size:11px;color:#64748b;cursor:pointer}
.nav-btn:hover{border-color:#38bdf8;color:#38bdf8}
/* UTILS */
.pos{color:#22c55e}.neg{color:#ef4444}.acc{color:#38bdf8}.warn{color:#f59e0b}.neu{color:#c8cfe0}
.badge{background:#1a1a2e;border:1px solid #2a2a45;border-radius:4px;padding:2px 8px;font-size:11px;color:#64748b}
.badge.green{border-color:#166534;color:#22c55e;background:#052e16}
.badge.red{border-color:#7f1d1d;color:#ef4444;background:#1f0a0a}
.badge.blue{border-color:#1e3a5f;color:#38bdf8;background:#0c1a2e}
.badge.amber{border-color:#92400e;color:#f59e0b;background:#1c1200}
select,input[type=number],input[type=text]{background:#13131f;color:#c8cfe0;border:1px solid #1e2035;border-radius:4px;padding:4px 8px;font-size:12px}
select:focus,input:focus{border-color:#38bdf8;outline:none}
button.btn{background:#13131f;border:1px solid #1e2035;border-radius:4px;padding:5px 12px;font-size:12px;color:#64748b;cursor:pointer;transition:all 0.15s}
button.btn:hover{border-color:#38bdf8;color:#38bdf8}
button.btn.primary{background:#0c1a2e;border-color:#1e3a5f;color:#38bdf8}
button.btn.primary:hover{background:#0f2040;border-color:#38bdf8}
button.btn.success{background:#052e16;border-color:#166534;color:#22c55e}
button.btn.danger{background:#1f0a0a;border-color:#7f1d1d;color:#ef4444}
.card{background:#13131f;border:1px solid #1e2035;border-radius:8px;padding:12px 16px}
.section-title{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#334155;font-weight:600;margin-bottom:8px}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:#0d0d14}
::-webkit-scrollbar-thumb{background:#1e2035;border-radius:2px}
`;

// Generar nav HTML
function navHTML(activePage){
  const pages=[
    {href:'index.html',icon:'📈',label:'Analizador'},
    {href:'positions.html',icon:'📊',label:'Posiciones'},
    {href:'chain.html',icon:'📋',label:'Cadena'},
    {href:'iv.html',icon:'🌊',label:'IV & Mercado'},
    {href:'ajuste.html',icon:'🔧',label:'Ajuste'},
    {href:'diario.html',icon:'📓',label:'Diario'},
  ];
  return `<nav>
    <div class="nav-logo"><span class="c">Cripto</span><span class="o">Opciones</span><span class="l"> LAB</span></div>
    <div class="nav-links">
      ${pages.map(p=>`<a href="${p.href}" class="nav-link${activePage===p.href?' active':''}">${p.icon} ${p.label}</a>`).join('')}
    </div>
    <div class="nav-spacer"></div>
    <span class="nav-exchange" id="nav-exchange">${COState.exchange}</span>
    <span class="nav-price" id="nav-price" style="display:flex;align-items:center;gap:6px;min-width:220px">
      <span id="np-btc" style="color:#f7931a;font-weight:700">BTC $--</span>
      <span style="color:#334155">|</span>
      <span id="np-eth" style="color:#8b9cf7;font-weight:700">ETH $--</span>
    </span>
    <span class="nav-ivr badge" id="nav-ivr">IVR --</span>
    <button class="nav-btn" onclick="navRefresh()">⟳</button>
  </nav>`;
  // Run after nav is injected into DOM
  setTimeout(_initNav, 0);
}

// ── Auto-init nav prices y active link ─────────────────────────────────────
function _initNav(){
  // Set active link — runs AFTER navHTML() injects the nav into DOM
  const cur=location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.nav-link').forEach(function(a){
    a.classList.toggle('active',a.getAttribute('href')===cur);
  });
  // Load BTC + ETH prices
  _loadNavPrices();
  setInterval(_loadNavPrices,30000);
}

async function _loadNavPrices(){
  try{
    const [rb,re]=await Promise.all([
      fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT').then(r=>r.json()),
      fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=ETHUSDT').then(r=>r.json()),
    ]);
    const btc=parseFloat(rb.result.list[0].lastPrice);
    const eth=parseFloat(re.result.list[0].lastPrice);
    const nb=document.getElementById('np-btc');
    const ne=document.getElementById('np-eth');
    if(nb)nb.textContent='BTC $'+btc.toLocaleString('es',{maximumFractionDigits:0});
    if(ne)ne.textContent='ETH $'+eth.toLocaleString('es',{maximumFractionDigits:0});
    if(eth)COState.spot=eth;
  }catch(e){}
}

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
  get exchange(){return 'Deribit'},
  set exchange(v){localStorage.setItem('co_exchange','Deribit')},
  get activo(){const v=localStorage.getItem('co_activo')||'BTC';return ['BTC','ETH'].includes(v)?v:'BTC'},
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

// ── Volatilidad unificada ──────────────────────────────────────────────────
// IV Rank/Percentile oficiales viven en iv_engine.js. Esta función queda solo
// por compatibilidad con código antiguo: devuelve el IVR 52w persistido, o NaN
// mientras el histórico real todavía se está construyendo.
function calcIVR(ivActual, activo){
  const st=(typeof IVEngine!=='undefined')?IVEngine.get(activo):null;
  return st && Number.isFinite(st.ivRank52w) ? st.ivRank52w : NaN;
}

async function getUnifiedVolState(activo, spot, targetDTE=7){
  if(typeof IVEngine==='undefined') throw new Error('IVEngine no cargado');
  return IVEngine.update({exchange:COState.exchange,asset:activo,spot,targetDTE});
}

function volStateLabel(st){
  if(!st) return 'Sin datos';
  return st.ready ? '52W READY' : `Construyendo ${Math.floor(st.historyDays||0)}/365d`;
}


// Extractor unificado de IV ATM del primer vencimiento
function obtenerIVATM(opts, spot) {
  if (!opts || !opts.length) return COState.iv || 48.5;
  const validas = opts.filter(o => o.iv > 5 && o.iv < 300);
  if (!validas.length) return COState.iv || 48.5;

  const expiries = [...new Set(validas.map(o => o.expiry))].sort((a,b) => parseExpiryDate(a) - parseExpiryDate(b));
  const frontOpts = validas.filter(o => o.expiry === expiries[0]);

  const atmOpt = frontOpts.reduce((prev, curr) => 
    Math.abs(curr.strike - spot) < Math.abs(prev.strike - spot) ? curr : prev, frontOpts[0]);

  return +(atmOpt ? atmOpt.iv : 48.5).toFixed(1);
}

// Fetch precio — adaptador único Deribit
async function fetchSpot(exchange,activo){
  try{
    if(typeof ExchangeEngine!=='undefined' && ExchangeEngine.EXCHANGES.includes(exchange)){
      return (await ExchangeEngine.getSpot(exchange,activo)).price;
    }
    throw new Error('ExchangeEngine no cargado o exchange no soportado');
  }catch(e){console.warn('fetchSpot:',e);return null;}
}

// Fetch opciones — schema normalizado común.
async function fetchOptions(exchange,activo){
  try{
    if(typeof ExchangeEngine!=='undefined' && ExchangeEngine.EXCHANGES.includes(exchange)){
      return await ExchangeEngine.getOptions(exchange,activo);
    }
    throw new Error('ExchangeEngine no cargado o exchange no soportado');
  }catch(e){console.warn('fetchOptions:',e);return [];}
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
    {href:'positions.html',icon:'🛡️',label:'Riesgo & Posiciones'},
    {href:'chain.html',icon:'📋',label:'Cadena'},
    {href:'iv.html',icon:'🌊',label:'Volatilidad'},
    {href:'ajuste.html',icon:'🔧',label:'Ajuste / Roll'},
    {href:'diario.html',icon:'📓',label:'Diario'},
    {href:'manual.html',icon:'📖',label:'Manual'},
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
}

// Auto-init nav prices y active link sin sobrescribir el spot activo
async function _loadNavPrices(){
  try{
    const ex=COState.exchange;
    const [rb,re]=await Promise.all([ExchangeEngine.getSpot(ex,'BTC'),ExchangeEngine.getSpot(ex,'ETH')]);
    const btc=rb.price,eth=re.price;
    const nb=document.getElementById('np-btc'),ne=document.getElementById('np-eth');
    if(nb)nb.textContent='BTC $'+btc.toLocaleString('es',{maximumFractionDigits:0});
    if(ne)ne.textContent='ETH $'+eth.toLocaleString('es',{maximumFractionDigits:0});
    const spotActivo=COState.activo==='BTC'?btc:eth;if(spotActivo)COState.spot=spotActivo;
  }catch(e){}
}

function _setActiveNav(){
  const cur=location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.nav-link').forEach(function(a){
    a.classList.toggle('active',a.getAttribute('href')===cur);
  });
}

function _initNav(){
  _setActiveNav();
  _loadNavPrices();
  setInterval(_loadNavPrices,30000);
}

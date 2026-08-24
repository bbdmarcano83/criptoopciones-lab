/**
 * CriptoOpciones Lab — Módulo de conexión al Bot V5
 * Configura BOT_URL y BOT_TOKEN con los valores de tu Render
 */

// ── Configuración ──────────────────────────────────────────────────────────
const BOT_CONFIG = {
  url:   localStorage.getItem('co_bot_url')   || '',
  token: localStorage.getItem('co_bot_token') || '',
};

function saveBotConfig(url, token){
  BOT_CONFIG.url   = url;
  BOT_CONFIG.token = token;
  localStorage.setItem('co_bot_url',   url);
  localStorage.setItem('co_bot_token', token);
}

// ── Cliente HTTP ───────────────────────────────────────────────────────────
async function botFetch(path, options={}){
  if(!BOT_CONFIG.url||!BOT_CONFIG.token)
    throw new Error('Bot no configurado. Ve a Configuración.');
  const res = await fetch(BOT_CONFIG.url + path, {
    ...options,
    headers: {
      'X-Bot-Token': BOT_CONFIG.token,
      'Content-Type': 'application/json',
      ...(options.headers||{}),
    },
  });
  if(!res.ok) throw new Error(`Bot API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── API calls ──────────────────────────────────────────────────────────────
const BotAPI = {
  // Estado general
  async status()    { return botFetch('/status'); },

  // PnL agrupado por estrategia
  async portfolio() { return botFetch('/portfolio'); },

  // IV, IVR real 52w desde la base de datos del bot
  async mercado(asset) { return botFetch(`/mercado/${asset}`); },

  // Griegas del portafolio
  async greeks()    { return botFetch('/greeks'); },

  // Estadísticas históricas
  async stats(asset='') { return botFetch('/stats'+(asset?`?asset=${asset}`:'')); },

  // Pausar / reanudar
  async pause()     { return botFetch('/pause',  {method:'POST'}); },
  async resume()    { return botFetch('/resume', {method:'POST'}); },

  // Cerrar posición
  async closePosition(label, reason='manual'){
    return botFetch(`/positions/${label}/close`, {
      method: 'POST',
      body: JSON.stringify({reason}),
    });
  },

  /**
   * Adoptar estrategia — el bot la gestiona (TP/SL/roll)
   * legs: [{symbol, side:'buy'|'sell', qty, prima}]
   */
  async adoptar(asset, estrategia, legs, tpPct=50, slPct=100, label=''){
    return botFetch('/adoptar', {
      method: 'POST',
      body: JSON.stringify({asset, estrategia, patas:legs, tp_pct:tpPct, sl_pct:slPct, label}),
    });
  },

  /**
   * Ejecutar órdenes en Bybit desde la app
   * legs: [{symbol, side:'Buy'|'Sell', qty}]
   * dryRun: true = simulación, false = real
   */
  async ejecutar(legs, dryRun=false){
    return botFetch('/ejecutar', {
      method: 'POST',
      body: JSON.stringify({patas:legs, dry_run:dryRun}),
    });
  },
};

// ── Widget de configuración del bot ───────────────────────────────────────
function renderBotConfigWidget(containerId){
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = `
    <div style="background:#13131f;border:1px solid #1e2035;border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:8px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#334155;font-weight:600">Conexión al Bot V5</div>
      <input type="text" id="bot-url-inp" placeholder="https://tu-bot.onrender.com"
        value="${BOT_CONFIG.url}" style="font-size:11px;height:28px">
      <input type="password" id="bot-token-inp" placeholder="API Token (X-Bot-Token)"
        value="${BOT_CONFIG.token}" style="font-size:11px;height:28px">
      <div style="display:flex;gap:6px">
        <button onclick="saveBotConfigFromUI()" class="btn primary" style="flex:1;height:28px;font-size:11px">💾 Guardar</button>
        <button onclick="testBotConnection()" class="btn" style="flex:1;height:28px;font-size:11px">🔌 Probar</button>
      </div>
      <div id="bot-status-msg" style="font-size:10px;color:#475569;text-align:center"></div>
    </div>`;
}

function saveBotConfigFromUI(){
  const url   = document.getElementById('bot-url-inp').value.trim().replace(/\/$/, '');
  const token = document.getElementById('bot-token-inp').value.trim();
  saveBotConfig(url, token);
  document.getElementById('bot-status-msg').textContent = '✅ Configuración guardada';
}

async function testBotConnection(){
  const msg = document.getElementById('bot-status-msg');
  msg.textContent = '🔄 Probando conexión...';
  msg.style.color = '#475569';
  try{
    const data = await BotAPI.status();
    msg.textContent = `✅ Conectado | ${data.open_ic?.length||0} IC | ${data.open_ib?.length||0} IB | ${data.paused?'PAUSADO':'ACTIVO'}`;
    msg.style.color = '#22c55e';
  }catch(e){
    msg.textContent = '❌ Error: ' + e.message;
    msg.style.color = '#ef4444';
  }
}

// ── Widget de portfolio en vivo ────────────────────────────────────────────
async function renderPortfolio(containerId){
  const el = document.getElementById(containerId);
  if(!el) return;
  try{
    const data = await BotAPI.portfolio();
    if(!data.posiciones?.length){
      el.innerHTML = '<div style="font-size:11px;color:#334155;text-align:center;padding:12px">Sin posiciones abiertas</div>';
      return;
    }
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:10px;color:#334155">${data.total_open} posición(es) abiertas</span>
        <span style="font-size:14px;font-weight:700;color:${data.pnl_total>=0?'#22c55e':'#ef4444'}">${fmt(data.pnl_total)}</span>
      </div>
      ${data.posiciones.map(p=>`
        <div style="background:#0d0d14;border:1px solid #1e2035;border-radius:6px;padding:8px;margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <span style="font-size:11px;font-weight:600;color:#38bdf8">${p.estrategia}</span>
              <span style="font-size:10px;color:#475569;margin-left:6px">${p.asset} | ${p.expiry}</span>
            </div>
            <div style="text-align:right">
              <div style="font-size:13px;font-weight:700;color:${p.pnl>=0?'#22c55e':'#ef4444'}">${fmt(p.pnl)}</div>
              <div style="font-size:9px;color:${p.pnl>=0?'#22c55e':'#ef4444'}">${p.pnl_pct>=0?'+':''}${p.pnl_pct}%</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#334155">
            <span>Crédito: $${p.credito_entrada}</span>
            <button onclick="closePosFromApp('${p.label}')"
              style="background:#1f0a0a;border:1px solid #7f1d1d;color:#ef4444;border-radius:3px;padding:1px 8px;font-size:9px;cursor:pointer">
              Cerrar
            </button>
          </div>
        </div>`).join('')}`;
  }catch(e){
    el.innerHTML = `<div style="font-size:10px;color:#ef4444;padding:8px">${e.message}</div>`;
  }
}

async function closePosFromApp(label){
  if(!confirm(`¿Cerrar posición ${label}?`)) return;
  try{
    const r = await BotAPI.closePosition(label, 'manual_app');
    alert(`✅ Cerrado | PnL: $${r.pnl?.toFixed(2)||'--'}`);
    renderPortfolio('portfolio-widget');
  }catch(e){
    alert('❌ Error: '+e.message);
  }
}

// ── Botón Ejecutar estrategia ──────────────────────────────────────────────
/**
 * Llamar desde la app cuando el usuario quiere ejecutar las patas armadas.
 * legs viene del estado global COState.legs
 */
async function ejecutarEstrategia(legs, asset, estrategia, tpPct=50, slPct=100){
  if(!legs?.length){ alert('No hay patas armadas'); return; }

  // Validar configuración
  if(!BOT_CONFIG.url||!BOT_CONFIG.token){
    alert('Configura la URL y token del bot primero');
    return;
  }

  // Resumen para confirmar
  const resumen = legs.map(l=>
    `${l.accion?.toUpperCase()||l.side} ${l.tipo?.toUpperCase()||''} $${l.strike||''} × ${l.qty} @ $${l.prima}`
  ).join('\n');
  const credNeto = legs.reduce((s,l)=>s+((l.accion==='sell'||l.side==='Sell')?l.prima:-l.prima)*l.qty, 0);

  if(!confirm(
    `¿Ejecutar en Bybit?\n\n${resumen}\n\nCrédito neto: $${credNeto.toFixed(2)}\nTP: ${tpPct}% | SL: ${slPct}%\n\n⚠️ Esto ejecutará órdenes REALES`
  )) return;

  try{
    // 1. Ejecutar las órdenes en Bybit
    const patasEjecutar = legs.map(l=>({
      symbol: l.contrato || `${asset}-${l.strike}-${l.tipo==='call'?'C':'P'}-USDT`,
      side:   l.accion==='buy'?'Buy':'Sell',
      qty:    l.qty,
    }));

    const resEjec = await BotAPI.ejecutar(patasEjecutar, false);
    if(!resEjec.ok) throw new Error(resEjec.error||'Error ejecutando');

    // 2. Adoptar la posición para que el bot la gestione
    const patasAdoptar = legs.map(l=>({
      symbol: l.contrato || `${asset}-${l.strike}-${l.tipo==='call'?'C':'P'}-USDT`,
      side:   l.accion,
      qty:    l.qty,
      prima:  l.prima,
    }));

    const resAdopt = await BotAPI.adoptar(asset, estrategia, patasAdoptar, tpPct, slPct);

    alert(
      `✅ Ejecutado en Bybit!\n` +
      `Crédito neto: $${resAdopt.credito_neto?.toFixed(2)||credNeto.toFixed(2)}\n` +
      `Label: ${resAdopt.label}\n` +
      `El bot gestiona TP/SL desde ahora 🤖`
    );

    // Refrescar portfolio
    if(document.getElementById('portfolio-widget'))
      renderPortfolio('portfolio-widget');

  }catch(e){
    alert('❌ Error: '+e.message);
  }
}

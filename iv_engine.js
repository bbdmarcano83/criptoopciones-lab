/*
 * CriptoOpciones LAB — IV Engine 3.0
 * Núcleo único de volatilidad BTC / ETH.
 *
 * Principios:
 * 1) ATM IV = IV mark actual del exchange seleccionado (Bybit / Deribit).
 * 2) IVR 52W inmediato = benchmark de volatilidad implícita DVOL de Deribit
 *    (serie pública diaria, BTC/ETH). Esto evita IVR estáticos inventados y
 *    evita esperar un año para disponer de una referencia histórica útil.
 * 3) En paralelo se conserva un histórico propio del ATM IV de cada exchange,
 *    que podrá utilizarse más adelante como ATM-IVR específico del venue.
 */
(function(global){
'use strict';

const VERSION='3.0';
const ATM_STORAGE_KEY='co_iv_atm_history_v3';
const STATE_KEY='co_iv_state_v3';
const BENCHMARK_CACHE_KEY='co_iv_dvol_cache_v3';
const SAMPLE_MS=60*60*1000;
const DAY_MS=24*60*60*1000;
const YEAR_MS=365*DAY_MS;
const BENCHMARK_CACHE_MS=6*60*60*1000;
const MAX_POINTS=15000;
const VALID_ASSETS=['BTC','ETH'];
const VALID_EXCHANGES=['Bybit','Deribit'];
const DERIBIT='https://www.deribit.com/api/v2';

function load(k){try{return JSON.parse(localStorage.getItem(k)||'{}')||{};}catch{return{};}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){console.warn('IVEngine storage',e);return false;}}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;}
function atmKey(exchange,asset,targetDTE){return `${exchange}:${asset}:${Math.round(Number(targetDTE)||30)}D`;}
function pctRank(vals,x){return vals.length?+(vals.filter(v=>v<=x).length/vals.length*100).toFixed(1):null;}
function ivRank(vals,x){
  if(!vals.length||!Number.isFinite(Number(x)))return null;
  const mn=Math.min(...vals),mx=Math.max(...vals);
  return mx<=mn?50:+clamp((Number(x)-mn)/(mx-mn)*100,0,100).toFixed(1);
}
function normalizeVol(v){
  v=Number(v);
  if(!Number.isFinite(v)||v<=0)return null;
  // Algunas series históricas de volatilidad pueden venir en decimal (0.55)
  // y otras en puntos de volatilidad (55). Normalizamos a porcentaje.
  return v<=5?v*100:v;
}
function uniqueDaily(points){
  const m=new Map();
  for(const p of points||[]){
    const ts=Number(p.ts),close=normalizeVol(p.close);
    if(!Number.isFinite(ts)||!(close>0))continue;
    const d=new Date(ts); const key=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
    // Nos quedamos con el último cierre disponible del día.
    const prev=m.get(key); if(!prev||ts>=prev.ts)m.set(key,{ts,close});
  }
  return [...m.values()].sort((a,b)=>a.ts-b.ts);
}

function group(options){
  const m=new Map();
  for(const o of options||[]){
    if(!o.expiry||!(o.expiryTs>Date.now())||!(Number(o.iv)>0))continue;
    if(!m.has(o.expiry))m.set(o.expiry,{expiry:o.expiry,expiryTs:o.expiryTs,rows:[]});
    m.get(o.expiry).rows.push(o);
  }
  return [...m.values()];
}

function extractReference(options,spot,targetDTE){
  spot=Number(spot); targetDTE=Number(targetDTE)||30;
  const now=Date.now();
  const candidates=group(options).map(g=>{
    const strikes=[...new Set(g.rows.map(x=>Number(x.strike)).filter(Number.isFinite))]
      .sort((a,b)=>Math.abs(a-spot)-Math.abs(b-spot));
    if(!strikes.length)return null;
    const strike=strikes[0],rows=g.rows.filter(x=>Number(x.strike)===strike);
    const c=rows.find(x=>x.type==='call'),p=rows.find(x=>x.type==='put');
    const vals=[Number(c?.iv),Number(p?.iv)].filter(v=>Number.isFinite(v)&&v>0);
    if(!vals.length)return null;
    return {
      expiry:g.expiry,
      expiryTs:g.expiryTs,
      dte:(g.expiryTs-now)/DAY_MS,
      strike,
      iv:mean(vals),
      callIv:Number.isFinite(Number(c?.iv))?Number(c.iv):null,
      putIv:Number.isFinite(Number(p?.iv))?Number(p.iv):null
    };
  }).filter(Boolean);
  if(!candidates.length)return null;
  return candidates.sort((a,b)=>Math.abs(a.dte-targetDTE)-Math.abs(b.dte-targetDTE))[0];
}

function addAtmSnapshot(k,iv,meta){
  const h=load(ATM_STORAGE_KEY),arr=Array.isArray(h[k])?h[k]:[],now=Date.now(),last=arr[arr.length-1];
  if(last&&now-Number(last[0])<SAMPLE_MS)return false;
  arr.push([now,+Number(iv).toFixed(2),+Number(meta.dte).toFixed(2),Number(meta.strike),meta.expiry]);
  if(arr.length>MAX_POINTS)arr.splice(0,arr.length-MAX_POINTS);
  h[k]=arr; save(ATM_STORAGE_KEY,h); return true;
}

function calculateLocalAtmRank(k,currentIV){
  const h=load(ATM_STORAGE_KEY),arr=Array.isArray(h[k])?h[k]:[],cutoff=Date.now()-YEAR_MS;
  const window=arr.filter(x=>Array.isArray(x)&&Number(x[0])>=cutoff&&Number(x[1])>0&&Number(x[1])<400);
  const vals=window.map(x=>Number(x[1]));
  const first=window[0]?.[0]||null,days=first?(Date.now()-first)/DAY_MS:0;
  const ready=days>=330&&vals.length>=300;
  return {
    ready,
    sampleCount:vals.length,
    historyDays:+days.toFixed(1),
    ivRank52w:ready?ivRank(vals,currentIV):null,
    ivPercentile52w:ready?pctRank(vals,currentIV):null,
    min52w:vals.length?+Math.min(...vals).toFixed(2):null,
    max52w:vals.length?+Math.max(...vals).toFixed(2):null
  };
}

async function fetchJSON(url){
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const j=await r.json();
  if(j?.error)throw new Error(j.error?.message||'Deribit error');
  return j;
}

async function fetchDvolHistory(asset,{days=370,force=false}={}){
  asset=String(asset||'BTC').toUpperCase();
  if(!VALID_ASSETS.includes(asset))throw new Error(`Activo no soportado: ${asset}`);
  const cache=load(BENCHMARK_CACHE_KEY),cached=cache[asset];
  if(!force&&cached?.savedAt&&Date.now()-cached.savedAt<BENCHMARK_CACHE_MS&&Array.isArray(cached.points)&&cached.points.length>200){
    return cached.points;
  }

  const end=Date.now();
  const start=end-(Number(days)||370)*DAY_MS;
  let cursorEnd=end;
  const all=[];
  let safety=0;

  while(cursorEnd>start&&safety++<20){
    const u=new URL(`${DERIBIT}/public/get_volatility_index_data`);
    u.searchParams.set('currency',asset);
    u.searchParams.set('start_timestamp',String(start));
    u.searchParams.set('end_timestamp',String(cursorEnd));
    u.searchParams.set('resolution','1D');
    const j=await fetchJSON(u.toString());
    const rows=Array.isArray(j?.result?.data)?j.result.data:[];
    for(const r of rows){
      if(!Array.isArray(r)||r.length<5)continue;
      const ts=Number(r[0]),close=normalizeVol(r[4]);
      if(Number.isFinite(ts)&&close>0)all.push({ts,close});
    }
    const cont=Number(j?.result?.continuation);
    if(!Number.isFinite(cont)||cont<=start||cont>=cursorEnd)break;
    cursorEnd=cont;
  }

  const points=uniqueDaily(all).filter(p=>p.ts>=start&&p.ts<=end);
  if(points.length<30)throw new Error(`DVOL ${asset}: histórico insuficiente (${points.length})`);
  cache[asset]={savedAt:Date.now(),points}; save(BENCHMARK_CACHE_KEY,cache);
  return points;
}

function calculateBenchmark(points){
  const daily=uniqueDaily(points);
  if(!daily.length)return null;
  const now=Date.now();
  const y=daily.filter(p=>p.ts>=now-YEAR_MS);
  const d90=daily.filter(p=>p.ts>=now-90*DAY_MS);
  const current=y.at(-1)?.close??daily.at(-1)?.close??null;
  const vals52=y.map(p=>p.close).filter(v=>v>0&&v<400);
  const vals90=d90.map(p=>p.close).filter(v=>v>0&&v<400);
  const spanDays=y.length>1?(y.at(-1).ts-y[0].ts)/DAY_MS:0;
  const ready=vals52.length>=250&&spanDays>=300;
  return {
    ready,
    current:+Number(current).toFixed(2),
    ivRank52w:vals52.length?ivRank(vals52,current):null,
    ivPercentile52w:vals52.length?pctRank(vals52,current):null,
    min52w:vals52.length?+Math.min(...vals52).toFixed(2):null,
    max52w:vals52.length?+Math.max(...vals52).toFixed(2):null,
    ivRank90d:vals90.length?ivRank(vals90,current):null,
    ivPercentile90d:vals90.length?pctRank(vals90,current):null,
    sampleCount52w:vals52.length,
    historyDays52w:+spanDays.toFixed(1),
    lastTimestamp:y.at(-1)?.ts??null,
    source:'Deribit DVOL',
    methodology:'Deribit volatility index daily close; 52W/90D rank & percentile'
  };
}

async function getBenchmark(asset,{force=false}={}){
  const points=await fetchDvolHistory(asset,{days:370,force});
  return calculateBenchmark(points);
}

async function update({exchange='Bybit',asset='BTC',spot,targetDTE=30,options=null,forceBenchmark=false}={}){
  exchange=String(exchange); asset=String(asset).toUpperCase(); targetDTE=Number(targetDTE)||30; spot=Number(spot);
  if(!VALID_EXCHANGES.includes(exchange))throw new Error(`Exchange no soportado: ${exchange}`);
  if(!VALID_ASSETS.includes(asset))throw new Error(`Activo no soportado: ${asset}`);
  if(!global.ExchangeEngine&&!options)throw new Error('ExchangeEngine no cargado');

  if(!(spot>0)){
    const s=await global.ExchangeEngine.getSpot(exchange,asset); spot=Number(s.price);
  }
  if(!options)options=await global.ExchangeEngine.getOptions(exchange,asset);
  const ref=extractReference(options,spot,targetDTE);
  if(!ref)throw new Error(`${exchange}: sin IV ATM válida para ${asset}`);

  const k=atmKey(exchange,asset,targetDTE);
  const snapshotAdded=addAtmSnapshot(k,ref.iv,ref);
  const local=calculateLocalAtmRank(k,ref.iv);

  let benchmark=null,benchmarkError=null;
  try{ benchmark=await getBenchmark(asset,{force:forceBenchmark}); }
  catch(e){ benchmarkError=e?.message||String(e); console.warn('IVEngine benchmark',benchmarkError); }

  // El IVR principal de la terminal es un benchmark histórico de volatilidad implícita.
  // Si DVOL no está disponible, usamos ATM-IVR propio sólo cuando ya tenga cobertura real.
  const useBenchmark=benchmark&&Number.isFinite(Number(benchmark.ivRank52w));
  const ready=useBenchmark||local.ready;
  const ivr=useBenchmark?benchmark.ivRank52w:local.ivRank52w;
  const ivp=useBenchmark?benchmark.ivPercentile52w:local.ivPercentile52w;
  const min52=useBenchmark?benchmark.min52w:local.min52w;
  const max52=useBenchmark?benchmark.max52w:local.max52w;

  const st={
    version:VERSION,
    exchange,asset,targetDTE,
    currentIV:+Number(ref.iv).toFixed(2),
    atmIV:+Number(ref.iv).toFixed(2),
    ivRank52w:ivr,
    ivPercentile52w:ivp,
    min52w:min52,
    max52w:max52,
    ivRank90d:benchmark?.ivRank90d??null,
    ivPercentile90d:benchmark?.ivPercentile90d??null,
    benchmarkIV:benchmark?.current??null,
    benchmarkSource:useBenchmark?'Deribit DVOL':(local.ready?`${exchange} ATM history`:null),
    benchmarkSampleCount:benchmark?.sampleCount52w??null,
    benchmarkHistoryDays:benchmark?.historyDays52w??null,
    localAtmRank52w:local.ivRank52w,
    localAtmPercentile52w:local.ivPercentile52w,
    localHistoryReady:local.ready,
    localHistoryDays:local.historyDays,
    localSampleCount:local.sampleCount,
    ready,
    status:ready?'READY':'NO_BENCHMARK',
    source:exchange,
    methodology:`ATM call/put mark IV near ${targetDTE}D + historical implied-volatility benchmark`,
    benchmarkMethodology:benchmark?.methodology??null,
    benchmarkError,
    expiry:ref.expiry,
    expiryDTE:+ref.dte.toFixed(2),
    atmStrike:ref.strike,
    callIv:ref.callIv,
    putIv:ref.putIv,
    snapshotAdded,
    lastSnapshot:Date.now()
  };

  const state=load(STATE_KEY);
  state[k]=st; state[`${exchange}:${asset}`]=st;
  if(exchange==='Bybit')state[asset]=st;
  save(STATE_KEY,state);
  return st;
}

function get(asset,exchange='Bybit',targetDTE=null){
  asset=String(asset||'BTC').toUpperCase();
  const st=load(STATE_KEY);
  if(targetDTE)return st[atmKey(exchange,asset,targetDTE)]||null;
  return st[`${exchange}:${asset}`]||st[asset]||null;
}
function getHistory(asset,exchange='Bybit',targetDTE=30){
  return load(ATM_STORAGE_KEY)[atmKey(exchange,String(asset||'BTC').toUpperCase(),targetDTE)]||[];
}
function clear(asset=null,exchange=null){
  const h=load(ATM_STORAGE_KEY);
  for(const k of Object.keys(h)){
    if((!asset||k.includes(`:${String(asset).toUpperCase()}:`))&&(!exchange||k.startsWith(`${exchange}:`)))delete h[k];
  }
  save(ATM_STORAGE_KEY,h);
}
function clearBenchmark(asset=null){
  const c=load(BENCHMARK_CACHE_KEY);
  if(asset)delete c[String(asset).toUpperCase()]; else for(const k of Object.keys(c))delete c[k];
  save(BENCHMARK_CACHE_KEY,c);
}

global.IVEngine={
  version:VERSION,
  update,get,getHistory,clear,
  extractReference,
  getBenchmark,
  fetchDvolHistory,
  calculateBenchmark,
  clearBenchmark
};
})(window);

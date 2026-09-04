/*
 * CriptoOpciones LAB — Deribit Exchange Engine
 * Public BTC_USDC / ETH_USDC linear options only.
 * Deribit is the single source of market truth for the terminal.
 */
(function(global){
'use strict';

const ASSETS=['BTC','ETH'];
const EXCHANGES=['Deribit'];
const CACHE_TTL=15000;
const cache=new Map();
const BASE='https://www.deribit.com/api/v2';

function n(v,fallback=0){const x=Number(v);return Number.isFinite(x)?x:fallback;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function cacheGet(k){const x=cache.get(k);return x&&Date.now()-x.ts<CACHE_TTL?x.data:null;}
function cacheSet(k,data){cache.set(k,{ts:Date.now(),data});return data;}
function assertAsset(a){a=String(a||'BTC').toUpperCase();if(!ASSETS.includes(a))throw new Error(`Activo no soportado: ${a}`);return a;}
function assertExchange(e){if(String(e||'Deribit')!=='Deribit')throw new Error('La terminal opera exclusivamente con Deribit');return 'Deribit';}

async function json(url){
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok)throw new Error(`HTTP ${r.status} — Deribit`);
  const j=await r.json();
  if(j?.error)throw new Error(j.error?.message||'Deribit API error');
  return j;
}
function parseDeribitSymbol(symbol){
  const p=String(symbol||'').split('-');
  const prefix=p[0]||'';
  const asset=prefix.split('_')[0]||'';
  return {asset,expiry:p[1]||'',strike:n(p[2],NaN),type:p[3]==='C'?'call':p[3]==='P'?'put':''};
}
function bsGreeks(S,K,T,sigma,type,r=0){
  if(!(S>0&&K>0&&T>0&&sigma>0))return {delta:0,gamma:0,theta:0,vega:0};
  const erf=x=>{const sign=x<0?-1:1;x=Math.abs(x);const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911,t=1/(1+p*x);return sign*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));};
  const cdf=x=>.5*(1+erf(x/Math.sqrt(2)));const pdf=x=>Math.exp(-.5*x*x)/Math.sqrt(2*Math.PI);
  const d1=(Math.log(S/K)+(r+.5*sigma*sigma)*T)/(sigma*Math.sqrt(T));const d2=d1-sigma*Math.sqrt(T);
  const delta=type==='call'?cdf(d1):cdf(d1)-1;
  const gamma=pdf(d1)/(S*sigma*Math.sqrt(T));
  const vega=S*pdf(d1)*Math.sqrt(T)/100;
  const theta=(type==='call'?(-(S*pdf(d1)*sigma)/(2*Math.sqrt(T))-r*K*Math.exp(-r*T)*cdf(d2)):(-(S*pdf(d1)*sigma)/(2*Math.sqrt(T))+r*K*Math.exp(-r*T)*cdf(-d2)))/365;
  return {delta,gamma,theta,vega};
}
function liquidity(o){
  const bid=n(o.bid),ask=n(o.ask),mark=n(o.mark);
  const spread=bid>0&&ask>0?Math.max(0,ask-bid):null;
  const spreadPct=spread!=null&&Math.abs(mark)>0?spread/Math.abs(mark)*100:null;
  const oiScore=Math.min(35,Math.log10(1+n(o.oi))*10);
  const volScore=Math.min(30,Math.log10(1+n(o.volume))*10);
  const spreadScore=spreadPct==null?5:Math.max(0,35-spreadPct*3.5);
  return {spread,spreadPct,score:+clamp(oiScore+volScore+spreadScore,0,100).toFixed(1)};
}

const Deribit={
  async spot(asset){
    asset=assertAsset(asset);const k=`Deribit:spot:${asset}`,c=cacheGet(k);if(c)return c;
    const j=await json(`${BASE}/public/get_index_price?index_name=${asset.toLowerCase()}_usdc`);
    const price=n(j.result?.index_price);if(!price)throw new Error(`Deribit sin índice ${asset}_USDC`);
    return cacheSet(k,{exchange:'Deribit',asset,price,change24h:null,ts:Date.now(),source:'DERIBIT_INDEX_USDC'});
  },
  async instruments(asset){
    asset=assertAsset(asset);const k=`Deribit:inst:${asset}`,c=cacheGet(k);if(c)return c;
    const j=await json(`${BASE}/public/get_instruments?currency=USDC&kind=option&expired=false`);
    const prefix=`${asset}_USDC-`;
    return cacheSet(k,(j.result||[]).filter(x=>String(x.instrument_name||'').startsWith(prefix)&&n(x.expiration_timestamp)>Date.now()));
  },
  async options(asset){
    asset=assertAsset(asset);const k=`Deribit:opts:${asset}`,c=cacheGet(k);if(c)return c;
    const [spot,inst,sumJ]=await Promise.all([
      this.spot(asset),
      this.instruments(asset),
      json(`${BASE}/public/get_book_summary_by_currency?currency=USDC&kind=option`)
    ]);
    const prefix=`${asset}_USDC-`;
    const meta=new Map(inst.map(x=>[x.instrument_name,x]));
    const out=(sumJ.result||[]).filter(o=>String(o.instrument_name||'').startsWith(prefix)).map(o=>{
      const m=meta.get(o.instrument_name);if(!m)return null;
      const p=parseDeribitSymbol(o.instrument_name),expiryTs=n(m.expiration_timestamp);
      if(!p.type||!Number.isFinite(p.strike)||expiryTs<=Date.now())return null;
      const under=n(o.underlying_price)||spot.price;
      const iv=n(o.mark_iv);
      const T=Math.max(1e-8,(expiryTs-Date.now())/31557600000);
      const g=bsGreeks(under,p.strike,T,iv/100,p.type,n(o.interest_rate)/100);
      const row={
        exchange:'Deribit',asset,symbol:o.instrument_name,expiry:p.expiry,expiryTs,
        strike:p.strike,type:p.type,tipo:p.type,underlying:under,
        bid:n(o.bid_price),ask:n(o.ask_price),mark:n(o.mark_price),last:n(o.last),
        priceUnit:'USDC',iv,bidIv:0,askIv:0,
        delta:g.delta,gamma:g.gamma,theta:g.theta,vega:g.vega,
        oi:n(o.open_interest),volume:n(o.volume),raw:o
      };
      Object.assign(row,liquidity(row));return row;
    }).filter(Boolean);
    return cacheSet(k,out);
  }
};

async function getSpot(exchange,asset){assertExchange(exchange);return Deribit.spot(asset);}
async function getOptions(exchange,asset){assertExchange(exchange);return Deribit.options(asset);}
async function getSnapshot(exchange,asset){const [spot,options]=await Promise.all([getSpot(exchange,asset),getOptions(exchange,asset)]);return {exchange:'Deribit',asset,spot,options,ts:Date.now()};}
function clearCache(){cache.clear();}

global.ExchangeEngine={version:'3.0-deribit-only',ASSETS,EXCHANGES,getSpot,getOptions,getSnapshot,clearCache,liquidity};
})(window);

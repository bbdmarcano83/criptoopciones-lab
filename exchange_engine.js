/*
 * CriptoOpciones LAB — Exchange Engine
 * Normaliza datos públicos de opciones BTC/ETH de Bybit y Deribit.
 * No ejecuta órdenes ni toca credenciales privadas.
 */
(function(global){
'use strict';

const ASSETS=['BTC','ETH'];
const EXCHANGES=['Bybit','Deribit'];
const CACHE_TTL=30000;
const cache=new Map();

function n(v,fallback=0){const x=Number(v);return Number.isFinite(x)?x:fallback;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function cacheGet(k){const x=cache.get(k);return x&&Date.now()-x.ts<CACHE_TTL?x.data:null;}
function cacheSet(k,data){cache.set(k,{ts:Date.now(),data});return data;}
function assertAsset(a){a=String(a||'BTC').toUpperCase();if(!ASSETS.includes(a))throw new Error(`Activo no soportado: ${a}`);return a;}
function assertExchange(e){e=String(e||'Deribit');if(!EXCHANGES.includes(e))throw new Error(`Exchange no soportado: ${e}`);return e;}

async function json(url){
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok)throw new Error(`HTTP ${r.status} — ${url}`);
  return r.json();
}
function parseBybitSymbol(symbol){
  const p=String(symbol||'').split('-');
  return {expiry:p[1]||'',strike:n(p[2],NaN),type:p[3]==='C'?'call':p[3]==='P'?'put':''};
}
function parseDeribitSymbol(symbol){
  const p=String(symbol||'').split('-');
  return {expiry:p[1]||'',strike:n(p[2],NaN),type:p[3]==='C'?'call':p[3]==='P'?'put':''};
}
function bsGreeks(S,K,T,sigma,type,r=0){
  if(!(S>0&&K>0&&T>0&&sigma>0))return {delta:0,gamma:0,theta:0,vega:0};
  const erf=x=>{const sign=x<0?-1:1; x=Math.abs(x); const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911,t=1/(1+p*x); return sign*(1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x));};
  const cdf=x=>.5*(1+erf(x/Math.sqrt(2))); const pdf=x=>Math.exp(-.5*x*x)/Math.sqrt(2*Math.PI);
  const d1=(Math.log(S/K)+(r+.5*sigma*sigma)*T)/(sigma*Math.sqrt(T)); const d2=d1-sigma*Math.sqrt(T);
  const delta=type==='call'?cdf(d1):cdf(d1)-1;
  const gamma=pdf(d1)/(S*sigma*Math.sqrt(T));
  const vega=S*pdf(d1)*Math.sqrt(T)/100;
  const theta=(type==='call'?(-(S*pdf(d1)*sigma)/(2*Math.sqrt(T))-r*K*Math.exp(-r*T)*cdf(d2)):(-(S*pdf(d1)*sigma)/(2*Math.sqrt(T))+r*K*Math.exp(-r*T)*cdf(-d2)))/365;
  return {delta,gamma,theta,vega};
}
function liquidity(o){
  const bid=n(o.bid),ask=n(o.ask),mark=n(o.mark);
  const spread=bid>0&&ask>0?Math.max(0,ask-bid):null;
  const spreadPct=spread!=null&&mark>0?spread/mark*100:null;
  const oiScore=Math.min(35,Math.log10(1+n(o.oi))*10);
  const volScore=Math.min(30,Math.log10(1+n(o.volume))*10);
  const spreadScore=spreadPct==null?5:Math.max(0,35-spreadPct*3.5);
  return {spread,spreadPct,score:+clamp(oiScore+volScore+spreadScore,0,100).toFixed(1)};
}

const Bybit={
  async spot(asset){
    asset=assertAsset(asset); const k=`Bybit:spot:${asset}`,c=cacheGet(k);if(c)return c;
    const j=await json(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${asset}USDT`);
    if(j.retCode!==0)throw new Error(j.retMsg||'Bybit API error');
    const row=j.result?.list?.[0]; if(!row)throw new Error(`Bybit sin spot ${asset}`);
    return cacheSet(k,{exchange:'Bybit',asset,price:n(row.lastPrice),change24h:n(row.price24hPcnt)*100,ts:Date.now()});
  },
  async instruments(asset){
    asset=assertAsset(asset);const k=`Bybit:inst:${asset}`,c=cacheGet(k);if(c)return c;
    let cursor='',all=[];
    do{
      const j=await json(`https://api.bybit.com/v5/market/instruments-info?category=option&baseCoin=${asset}&status=Trading&limit=1000${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
      if(j.retCode!==0)throw new Error(j.retMsg||'Bybit API error');
      all.push(...(j.result?.list||[]));cursor=j.result?.nextPageCursor||'';
    }while(cursor);
    return cacheSet(k,all.filter(x=>n(x.deliveryTime)>Date.now()));
  },
  async options(asset){
    asset=assertAsset(asset);const k=`Bybit:opts:${asset}`,c=cacheGet(k);if(c)return c;
    const [spot,inst]=await Promise.all([this.spot(asset),this.instruments(asset)]);
    const expMap=new Map(); inst.forEach(x=>{const p=parseBybitSymbol(x.symbol);if(p.expiry)expMap.set(p.expiry,n(x.deliveryTime));});
    const j=await json(`https://api.bybit.com/v5/market/tickers?category=option&baseCoin=${asset}`);
    if(j.retCode!==0)throw new Error(j.retMsg||'Bybit API error');
    const out=(j.result?.list||[]).map(o=>{
      const p=parseBybitSymbol(o.symbol), expiryTs=expMap.get(p.expiry)||0;
      if(!p.type||!Number.isFinite(p.strike)||expiryTs<=Date.now())return null;
      const row={exchange:'Bybit',asset,symbol:o.symbol,expiry:p.expiry,expiryTs,strike:p.strike,type:p.type,tipo:p.type,
        underlying:n(o.underlyingPrice)||spot.price,bid:n(o.bid1Price),ask:n(o.ask1Price),mark:n(o.markPrice),last:n(o.lastPrice),
        iv:n(o.markIv)*100,bidIv:n(o.bid1Iv)*100,askIv:n(o.ask1Iv)*100,delta:n(o.delta),gamma:n(o.gamma),theta:n(o.theta),vega:n(o.vega),
        oi:n(o.openInterest),volume:n(o.volume24h),raw:o};
      Object.assign(row,liquidity(row));return row;
    }).filter(Boolean);
    return cacheSet(k,out);
  }
};

const Deribit={
  async spot(asset){
    asset=assertAsset(asset);const k=`Deribit:spot:${asset}`,c=cacheGet(k);if(c)return c;
    const j=await json(`https://www.deribit.com/api/v2/public/get_index_price?index_name=${asset.toLowerCase()}_usd`);
    const price=n(j.result?.index_price);if(!price)throw new Error(`Deribit sin índice ${asset}`);
    return cacheSet(k,{exchange:'Deribit',asset,price,change24h:null,ts:Date.now()});
  },
  async instruments(asset){
    asset=assertAsset(asset);const k=`Deribit:inst:${asset}`,c=cacheGet(k);if(c)return c;
    const j=await json(`https://www.deribit.com/api/v2/public/get_instruments?currency=${asset}&kind=option&expired=false`);
    return cacheSet(k,(j.result||[]).filter(x=>n(x.expiration_timestamp)>Date.now()));
  },
  async options(asset){
    asset=assertAsset(asset);const k=`Deribit:opts:${asset}`,c=cacheGet(k);if(c)return c;
    const [spot,instJ,sumJ]=await Promise.all([
      this.spot(asset),
      this.instruments(asset),
      json(`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${asset}&kind=option`)
    ]);
    const meta=new Map(instJ.map(x=>[x.instrument_name,x]));
    const out=(sumJ.result||[]).map(o=>{
      const m=meta.get(o.instrument_name);if(!m)return null;
      const p=parseDeribitSymbol(o.instrument_name),expiryTs=n(m.expiration_timestamp);
      if(!p.type||!Number.isFinite(p.strike)||expiryTs<=Date.now())return null;
      // Deribit inverse options quote premium in base coin. Normalize a USD view for cross-venue analysis.
      const bidRaw=n(o.bid_price),askRaw=n(o.ask_price),markRaw=n(o.mark_price),under=n(o.underlying_price)||spot.price;
      const T=Math.max(1e-8,(expiryTs-Date.now())/31557600000), iv=n(o.mark_iv);
      const g=bsGreeks(under,p.strike,T,iv/100,p.type,n(o.interest_rate)/100);
      const row={exchange:'Deribit',asset,symbol:o.instrument_name,expiry:p.expiry,expiryTs,strike:p.strike,type:p.type,tipo:p.type,
        underlying:under,bid:bidRaw*under,ask:askRaw*under,mark:markRaw*under,last:n(o.last)*under,
        bidRaw,askRaw,markRaw,priceUnit:asset,iv,bidIv:0,askIv:0,delta:g.delta,gamma:g.gamma,theta:g.theta,vega:g.vega,
        oi:n(o.open_interest),volume:n(o.volume),raw:o};
      Object.assign(row,liquidity(row));return row;
    }).filter(Boolean);
    return cacheSet(k,out);
  }
};

async function getSpot(exchange,asset){exchange=assertExchange(exchange);return (exchange==='Bybit'?Bybit:Deribit).spot(asset);}
async function getOptions(exchange,asset){exchange=assertExchange(exchange);return (exchange==='Bybit'?Bybit:Deribit).options(asset);}
async function getSnapshot(exchange,asset){const [spot,options]=await Promise.all([getSpot(exchange,asset),getOptions(exchange,asset)]);return {exchange,asset,spot,options,ts:Date.now()};}
function clearCache(){cache.clear();}

global.ExchangeEngine={version:'2.0',ASSETS,EXCHANGES,getSpot,getOptions,getSnapshot,clearCache,liquidity};
})(window);

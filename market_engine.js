/* CriptoOpciones LAB — Market/Volatility Analytics */
(function(global){
'use strict';
const DAY=86400000;
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function dte(ts){return Math.max(0,(n(ts)-Date.now())/DAY);}
function groupExp(options){
  const m=new Map(); options.forEach(o=>{if(!m.has(o.expiry))m.set(o.expiry,{expiry:o.expiry,expiryTs:o.expiryTs,rows:[]});m.get(o.expiry).rows.push(o);});
  return [...m.values()].sort((a,b)=>a.expiryTs-b.expiryTs);
}
function atmForExpiry(group,spot){
  if(!group?.rows?.length)return null;
  const strikes=[...new Set(group.rows.map(x=>x.strike))].sort((a,b)=>Math.abs(a-spot)-Math.abs(b-spot));
  const strike=strikes[0],rows=group.rows.filter(x=>x.strike===strike),call=rows.find(x=>x.type==='call'),put=rows.find(x=>x.type==='put');
  const ivs=[call?.iv,put?.iv].filter(x=>n(x)>0).map(Number);if(!ivs.length)return null;
  const liqs=[call?.score,put?.score].filter(x=>Number.isFinite(Number(x))).map(Number);
  return {expiry:group.expiry,expiryTs:group.expiryTs,dte:dte(group.expiryTs),strike,iv:mean(ivs),callIv:call?.iv??null,putIv:put?.iv??null,liquidity:mean(liqs)||0,call,put};
}
function termStructure(options,spot){return groupExp(options).map(g=>atmForExpiry(g,spot)).filter(Boolean);}
function referenceIV(options,spot,targetDTE=30){
  const term=termStructure(options,spot);if(!term.length)return null;
  return term.reduce((a,b)=>Math.abs(a.dte-targetDTE)<=Math.abs(b.dte-targetDTE)?a:b);
}
function closestDelta(rows,target){return rows.filter(x=>Number.isFinite(x.delta)&&n(x.iv)>0).sort((a,b)=>Math.abs(Math.abs(a.delta)-target)-Math.abs(Math.abs(b.delta)-target))[0]||null;}
function skew(options,expiry){
  const rows=options.filter(o=>o.expiry===expiry),put25=closestDelta(rows.filter(x=>x.type==='put'),.25),call25=closestDelta(rows.filter(x=>x.type==='call'),.25),put10=closestDelta(rows.filter(x=>x.type==='put'),.10),call10=closestDelta(rows.filter(x=>x.type==='call'),.10);
  const rr25=put25&&call25?put25.iv-call25.iv:null,rr10=put10&&call10?put10.iv-call10.iv:null;
  return {put25,call25,put10,call10,rr25,rr10,label:rr25==null?'N/D':rr25>3?'PUT PREMIUM':rr25<-3?'CALL PREMIUM':'BALANCED'};
}
function liquiditySummary(options){
  const scores=options.map(x=>n(x.score)).filter(x=>x>0);const avg=mean(scores)||0;
  return {score:+avg.toFixed(1),label:avg>=70?'HIGH':avg>=45?'MEDIUM':'LOW',totalOI:options.reduce((s,x)=>s+n(x.oi),0),totalVolume:options.reduce((s,x)=>s+n(x.volume),0)};
}
function termLabel(term){if(term.length<2)return'N/D';const short=term.find(x=>x.dte>=5)||term[0],long=[...term].reverse().find(x=>x.dte>=25)||term[term.length-1];if(!short||!long||short===long)return'FLAT';const diff=long.iv-short.iv;return diff>2?'CONTANGO':diff<-2?'BACKWARDATION':'FLAT';}
function regime({ivRank=null,term=[],skewData=null,liquidity=null,change24h=null}){
  const ivLabel=ivRank==null?'BUILDING':ivRank>=70?'HIGH':ivRank>=35?'MEDIUM':'LOW';
  const trend=change24h==null?'NEUTRAL':change24h>1?'BULLISH':change24h<-1?'BEARISH':'NEUTRAL';
  const tl=termLabel(term),sk=skewData?.label||'N/D',liq=liquidity?.label||'N/D';
  let score=50;if(ivRank!=null)score+=(ivRank-50)*.45;if(tl==='BACKWARDATION')score+=8;if(liq==='HIGH')score+=10;if(liq==='LOW')score-=10;if(sk==='PUT PREMIUM')score+=4;
  score=Math.round(clamp(score,0,100));
  return {trend,iv:ivLabel,term:tl,skew:sk,liquidity:liq,sellingScore:score,sellingLabel:score>=75?'STRONG':score>=55?'FAVORABLE':score>=40?'NEUTRAL':'UNFAVORABLE'};
}
function opportunity({ref,ivr,skewData,liquidity,term}){
  if(!ref)return {score:0,label:'NO DATA',strategy:'Esperar datos'};
  let score=45; if(ivr!=null)score+=(ivr-50)*.4; score+=(ref.liquidity-50)*.2; if(liquidity?.label==='HIGH')score+=8; if(termLabel(term)==='BACKWARDATION')score+=5; if(skewData?.label==='PUT PREMIUM')score+=3;
  score=Math.round(clamp(score,0,100));
  let strategy=ivr==null?'Monitorear / histórico IVR en construcción':ivr>=70?'Iron Condor / Iron Butterfly / Credit Spread':ivr>=40?'Calendar / estructura definida por skew':'Debit Spread / Calendar';
  return {score,label:score>=80?'A':score>=65?'B':score>=50?'C':'D',strategy};
}
async function analyze(exchange,asset,targetDTE=30){
  if(!global.ExchangeEngine)throw new Error('ExchangeEngine no cargado');
  const snap=await global.ExchangeEngine.getSnapshot(exchange,asset),spot=snap.spot.price,term=termStructure(snap.options,spot),ref=referenceIV(snap.options,spot,targetDTE);
  let ivr=null,ivp=null,historyReady=false;
  if(global.IVEngine&&ref){try{const st=await global.IVEngine.update({exchange,asset,spot,targetDTE,options:snap.options});ivr=st.ivRank52w;ivp=st.ivPercentile52w;historyReady=st.ready;}catch(e){console.warn(e);}}
  const sk=ref?skew(snap.options,ref.expiry):null,liq=liquiditySummary(snap.options),reg=regime({ivRank:ivr,term,skewData:sk,liquidity:liq,change24h:snap.spot.change24h}),opp=opportunity({ref,ivr,skewData:sk,liquidity:liq,term});
  return {...snap,term,reference:ref,skew:sk,liquidity:liq,ivRank52w:ivr,ivPercentile52w:ivp,historyReady,regime:reg,opportunity:opp};
}
global.MarketEngine={version:'2.0',dte,termStructure,referenceIV,skew,liquiditySummary,termLabel,regime,opportunity,analyze};
})(window);

/* CriptoOpciones LAB — Neutral Volatility Recommendation Policy */
(function(global){
'use strict';

const AUTO_CODES=new Set(['CAL','IC','IB','BWC','STRADDLE','STRANGLE']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function evaluate(candidate,market){
  const code=String(candidate.code||'').toUpperCase();
  const ivr=Number(market.ivRank52w);
  const ivp=Number(market.ivPercentile52w);
  const liq=num(candidate.liq);
  const delta=Math.abs(num(candidate.netDelta));
  const pop=Number(candidate.pop);
  const term=market.regime?.term||'N/D';
  const skew=market.skew?.label||'N/D';
  const credit=num(candidate.premium);
  const reasons=[];
  let eligible=AUTO_CODES.has(code);
  let regimeFit=50;
  let status='PASS';

  if(!eligible)reasons.push('Fuera del universo neutral automático');
  if(liq<55){eligible=false;reasons.push('Liquidez inferior a 55/100');}
  if(delta>.10){eligible=false;reasons.push(`Delta neta ${delta.toFixed(2)} supera 0.10`);}

  if(code==='CAL'){
    regimeFit=Number.isFinite(ivr)?clamp(100-(ivr*2),0,100):40;
    if(candidate.isPureCalendar!==true){eligible=false;reasons.push('Se exige Calendar puro, mismo strike');}
    if(Number.isFinite(ivr)&&ivr>35){eligible=false;reasons.push('IVR demasiado alta para comprar Calendar');}
    if(!['CONTANGO','FLAT'].includes(term)){eligible=false;reasons.push('Curva temporal desfavorable');}
    if(credit>=0){eligible=false;reasons.push('Calendar sin débito neto verificable');}
  }else if(code==='IC'){
    regimeFit=Number.isFinite(ivr)?clamp(ivr+20,0,100):45;
    if(Number.isFinite(ivr)&&ivr<35){eligible=false;reasons.push('IVR insuficiente para vender rango');}
    if(credit<=0){eligible=false;reasons.push('Crédito neto no positivo');}
    if(Number.isFinite(pop)&&pop<.60){eligible=false;reasons.push('POP teórica inferior a 60%');}
  }else if(code==='BWC'){
    regimeFit=Number.isFinite(ivr)?clamp(ivr+15,0,100):45;
    if(Number.isFinite(ivr)&&ivr<35){eligible=false;reasons.push('IVR insuficiente para vender rango');}
    if(credit<=0){eligible=false;reasons.push('Crédito neto no positivo');}
    if(skew==='BALANCED'){eligible=false;reasons.push('Sin skew que justifique alas asimétricas');}
    if(Number.isFinite(pop)&&pop<.60){eligible=false;reasons.push('POP teórica inferior a 60%');}
  }else if(code==='IB'){
    regimeFit=Number.isFinite(ivr)?clamp((ivr-50)*2,0,100):35;
    if(Number.isFinite(ivr)&&ivr<65){eligible=false;reasons.push('IB reservada para IVR muy alta');}
    if(credit<=0){eligible=false;reasons.push('Crédito neto no positivo');}
    if(Number.isFinite(pop)&&pop<.45){eligible=false;reasons.push('Break-even demasiado estrecho');}
  }else if(code==='STRADDLE'||code==='STRANGLE'){
    regimeFit=Number.isFinite(ivr)?clamp(100-(ivr*5),0,100):25;
    const extremeCheap=Number.isFinite(ivr)&&ivr<=10&&Number.isFinite(ivp)&&ivp<=15;
    if(!extremeCheap){eligible=false;reasons.push('Volatilidad no está extremadamente barata');}
    if(market.catalyst?.verified!==true){
      eligible=false;status='WATCH';
      reasons.push('Requiere catalizador verificable');
    }
    if(credit>=0){eligible=false;reasons.push('La compra de volatilidad debe ser débito');}
  }

  const popScore=Number.isFinite(pop)?clamp(pop*100,0,100):55;
  const economicScore=clamp(num(candidate.economicScore,55),0,100);
  const score=Math.round(clamp(
    popScore*.25+economicScore*.25+regimeFit*.20+liq*.15+
    clamp(100-delta*500,0,100)*.15,
    0,100
  ));

  if(!eligible&&status!=='WATCH')status='FAIL';
  if(eligible&&score<65){eligible=false;status='WATCH';reasons.push('Puntaje combinado inferior a 65');}

  return {...candidate,score,status,eligible,rejectionReasons:reasons};
}

function rank(candidates,market){
  return (candidates||[])
    .map(c=>evaluate(c,market))
    .filter(c=>AUTO_CODES.has(String(c.code||'').toUpperCase()))
    .sort((a,b)=>{
      const order={PASS:0,WATCH:1,FAIL:2};
      return order[a.status]-order[b.status]||b.score-a.score;
    });
}

global.NeutralStrategyPolicy={
  version:'1.0',
  autoCodes:[...AUTO_CODES],
  evaluate,
  rank,
  best(candidates,market){return rank(candidates,market).find(c=>c.eligible)||null;}
};
})(window);

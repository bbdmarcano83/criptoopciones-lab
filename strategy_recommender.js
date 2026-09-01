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
  const skew=market.skew?.label||'N/D';
  const credit=num(candidate.premium);
  const reasons=[];
  const checks=[];
  let eligible=AUTO_CODES.has(code);
  let regimeFit=50;
  let status='PASS';

  if(!eligible)reasons.push('Fuera del universo neutral automático');

  if(code==='CAL'){
    const m=candidate.calendarMetrics||{};
    regimeFit=Number.isFinite(ivr)?clamp(100-(ivr*2),0,100):40;
    const add=(pass,label,detail='')=>{
      checks.push({pass:Boolean(pass),label,detail});
      if(!pass){eligible=false;reasons.push(detail||label);}
    };
    add(Number.isFinite(ivr)&&ivr<=35,'IVR baja',Number.isFinite(ivr)?`IVR ${ivr.toFixed(1)}% (máx. 35%)`:'IVR no disponible');
    add(candidate.isPureCalendar===true&&m.sameStrike===true,'Mismo strike','Se exige Calendar puro con el mismo strike');
    add(credit<0&&m.debit>0,'Débito neto',m.debit>0?`Débito $${m.debit.toFixed(2)}`:'Débito no verificable');
    add(delta<=.20,'Delta neutral',`|Δ| ${delta.toFixed(2)} (máx. 0.20)`);
    add(liq>=55,'Liquidez',`${liq.toFixed(0)}/100 (mín. 55)`);
    add(m.backTimePass===true,'Valor temporal posterior',
      Number.isFinite(m.backTimeValue)?`Back conserva $${m.backTimeValue.toFixed(2)} de valor temporal`:'Valor temporal posterior no verificable');
    add(m.ivSpreadPass===true,'Curva de IV',
      Number.isFinite(m.ivSpread)?`IV back-front ${m.ivSpread>=0?'+':''}${m.ivSpread.toFixed(1)} pts (máx. +5)`:'Diferencia de IV no verificable');
    add(m.scenarioPass===true,'Zona ±0.5σ',
      Number.isFinite(m.scenarioLow)?`PnL: -0.5σ $${m.scenarioLow.toFixed(2)} · spot $${m.scenarioMid.toFixed(2)} · +0.5σ $${m.scenarioHigh.toFixed(2)}`:'Escenarios al expiry frontal no verificables');
  }else{
    if(liq<55){eligible=false;reasons.push('Liquidez inferior a 55/100');}
    if(delta>.10){eligible=false;reasons.push(`Delta neta ${delta.toFixed(2)} supera 0.10`);}

    if(code==='IC'){
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
  }

  const popScore=Number.isFinite(pop)?clamp(pop*100,0,100):55;
  const economicScore=clamp(num(candidate.economicScore,55),0,100);
  const deltaLimit=code==='CAL'?.20:.10;
  const score=Math.round(clamp(
    popScore*.25+economicScore*.25+regimeFit*.20+liq*.15+
    clamp(100-(delta/deltaLimit)*50,0,100)*.15,
    0,100
  ));

  if(!eligible&&status!=='WATCH')status='FAIL';
  if(eligible&&score<65){eligible=false;status='WATCH';reasons.push('Puntaje combinado inferior a 65');}

  return {...candidate,score,status,eligible,rejectionReasons:reasons,diagnosticChecks:checks};
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
  version:'1.1',
  autoCodes:[...AUTO_CODES],
  evaluate,
  rank,
  best(candidates,market){return rank(candidates,market).find(c=>c.eligible)||null;}
};
})(window);

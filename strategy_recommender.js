/* CriptoOpciones LAB — Neutral Volatility Advisory Ranking */
(function(global){
'use strict';

const AUTO_CODES=new Set(['CAL','IC','IB','BWC']);
const EXPECTED_LEGS={CAL:2,IC:4,IB:4,BWC:4};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function isStructurallyComplete(candidate,code){
  const legs=Array.isArray(candidate.legs)?candidate.legs:[];
  if(legs.length!==EXPECTED_LEGS[code])return false;
  const valid=legs.every(l=>l&&String(l.contrato||'').length>0&&num(l.strike)>0&&num(l.prima)>0&&num(l.qty)>0);
  if(!valid)return false;
  return code!=='CAL'||candidate.isPureCalendar===true;
}

function evaluate(candidate,market){
  const code=String(candidate.code||'').toUpperCase();
  const ivr=Number(market.ivRank52w);
  const liq=num(candidate.liq);
  const delta=Math.abs(num(candidate.netDelta));
  const pop=Number(candidate.pop);
  const skew=market.skew?.label||'N/D';
  const credit=num(candidate.premium);
  const observations=[];
  const checks=[];
  let meetsPolicy=AUTO_CODES.has(code);
  let regimeFit=50;

  const observe=(pass,message)=>{
    if(!pass){meetsPolicy=false;observations.push(message);}
  };

  if(!meetsPolicy)observations.push('Fuera del universo neutral automático');

  if(code==='CAL'){
    const m=candidate.calendarMetrics||{};
    regimeFit=Number.isFinite(ivr)?clamp(100-(ivr*2),0,100):40;
    const add=(pass,label,detail='')=>{
      checks.push({pass:Boolean(pass),label,detail});
      observe(pass,detail||label);
    };
    add(Number.isFinite(ivr)&&ivr<=35,'IVR baja',Number.isFinite(ivr)?`IVR ${ivr.toFixed(1)}% (objetivo ≤35%)`:'IVR no disponible');
    add(candidate.isPureCalendar===true&&m.sameStrike===true,'Mismo strike','Calendar puro requiere el mismo strike');
    add(credit<0&&m.debit>0,'Débito neto',m.debit>0?`Débito $${m.debit.toFixed(2)}`:'Débito no verificable');
    add(delta<=.20,'Delta neutral',`|Δ| ${delta.toFixed(2)} (objetivo ≤0.20)`);
    add(liq>=55,'Liquidez',`${liq.toFixed(0)}/100 (objetivo ≥55)`);
    add(m.backTimePass===true,'Valor temporal posterior',
      Number.isFinite(m.backTimeValue)?`Back conserva $${m.backTimeValue.toFixed(2)} de valor temporal`:'Valor temporal posterior no verificable');
    add(m.ivSpreadPass===true,'Curva de IV',
      Number.isFinite(m.ivSpread)?`IV back-front ${m.ivSpread>=0?'+':''}${m.ivSpread.toFixed(1)} pts (máx. +5)`:'Diferencia de IV no verificable');
    add(m.scenarioPass===true,'Zona ±0.5σ',
      Number.isFinite(m.scenarioLow)?`PnL: -0.5σ $${m.scenarioLow.toFixed(2)} · spot $${m.scenarioMid.toFixed(2)} · +0.5σ $${m.scenarioHigh.toFixed(2)}`:'Escenarios al expiry frontal no verificables');
  }else{
    observe(liq>=55,'Liquidez inferior al objetivo 55/100');
    observe(delta<=.10,`Delta neta ${delta.toFixed(2)} supera el objetivo 0.10`);

    if(code==='IC'){
      regimeFit=Number.isFinite(ivr)?clamp(ivr+20,0,100):45;
      observe(!Number.isFinite(ivr)||ivr>=35,'IVR inferior al objetivo para vender rango');
      observe(credit>0,'Crédito neto no positivo');
      observe(!Number.isFinite(pop)||pop>=.60,'POP teórica inferior al objetivo 60%');
    }else if(code==='BWC'){
      regimeFit=Number.isFinite(ivr)?clamp(ivr+15,0,100):45;
      observe(!Number.isFinite(ivr)||ivr>=35,'IVR inferior al objetivo para vender rango');
      observe(credit>0,'Crédito neto no positivo');
      observe(skew!=='BALANCED','Skew balanceado: aporta poco valor usar alas asimétricas');
      observe(!Number.isFinite(pop)||pop>=.60,'POP teórica inferior al objetivo 60%');
    }else if(code==='IB'){
      regimeFit=Number.isFinite(ivr)?clamp((ivr-50)*2,0,100):35;
      observe(!Number.isFinite(ivr)||ivr>=65,'IB preferible con IVR muy alta');
      observe(credit>0,'Crédito neto no positivo');
      observe(!Number.isFinite(pop)||pop>=.45,'Break-even/POP inferior al objetivo 45%');
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
  const selectable=isStructurallyComplete(candidate,code);
  const status=!selectable?'INCOMPLETA':score>=75?'ALTA':score>=60?'MEDIA':'BAJA';
  const regimePriority=!Number.isFinite(ivr)?50:
    ivr<35?(code==='CAL'?100:code==='BWC'?25:code==='IC'?20:10):
    ivr<65?(code==='IC'?95:code==='BWC'?90:code==='CAL'?55:40):
    (code==='IB'?100:code==='IC'?95:code==='BWC'?90:35);

  return {
    ...candidate,score,status,selectable,meetsPolicy,regimePriority,
    eligible:meetsPolicy,
    advisoryObservations:observations,
    rejectionReasons:observations,
    diagnosticChecks:checks
  };
}

function rank(candidates,market){
  return (candidates||[])
    .map(c=>evaluate(c,market))
    .filter(c=>AUTO_CODES.has(String(c.code||'').toUpperCase()))
    .sort((a,b)=>
      Number(b.selectable)-Number(a.selectable)||
      b.regimePriority-a.regimePriority||
      b.score-a.score
    );
}

global.NeutralStrategyPolicy={
  version:'1.4',
  autoCodes:[...AUTO_CODES],
  evaluate,
  rank,
  best(candidates,market){return rank(candidates,market).find(c=>c.selectable)||null;}
};
})(window);

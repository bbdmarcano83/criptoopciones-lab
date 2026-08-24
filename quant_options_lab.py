"""
🦅 Quant Options Lab — Terminal Institucional de Opciones
Corre con: streamlit run quant_options_lab.py
"""
import streamlit as st
import numpy as np
import plotly.graph_objects as go
from scipy.stats import norm
import requests

st.set_page_config(page_title="🦅 Quant Options Lab", layout="wide")

st.markdown("""
<style>
[data-testid="stMetricValue"] { font-size: 20px; font-weight: 600; }
div.stButton > button {
    width: 100%; font-size: 12px; padding: 6px 4px;
    border-radius: 6px; font-weight: 500;
}
div.stButton > button:hover { background: #1e3a5f; color: white; }
.strategy-active > button { background: #1e3a5f !important; color: white !important; }
</style>
""", unsafe_allow_html=True)

# ─── Black-Scholes ────────────────────────────────────────────────────────────
def bs(S, K, T, r, sigma, tipo='call'):
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        val = max(0.0, S-K) if tipo=='call' else max(0.0, K-S)
        return {'precio':val,'delta':0.0,'gamma':0.0,'theta':0.0,'vega':0.0}
    d1 = (np.log(S/K)+(r+0.5*sigma**2)*T)/(sigma*np.sqrt(T))
    d2 = d1 - sigma*np.sqrt(T)
    if tipo=='call':
        precio = S*norm.cdf(d1)-K*np.exp(-r*T)*norm.cdf(d2)
        delta  = norm.cdf(d1)
        theta  = (-(S*norm.pdf(d1)*sigma)/(2*np.sqrt(T))-r*K*np.exp(-r*T)*norm.cdf(d2))/365
    else:
        precio = K*np.exp(-r*T)*norm.cdf(-d2)-S*norm.cdf(-d1)
        delta  = norm.cdf(d1)-1
        theta  = (-(S*norm.pdf(d1)*sigma)/(2*np.sqrt(T))+r*K*np.exp(-r*T)*norm.cdf(-d2))/365
    gamma = norm.pdf(d1)/(S*sigma*np.sqrt(T))
    vega  = (S*norm.pdf(d1)*np.sqrt(T))/100
    return {'precio':precio,'delta':delta,'gamma':gamma,'theta':theta,'vega':vega}

def calc_pop(S, r, sigma, T, bes, pnl_arr):
    if T<=0 or sigma<=0 or not bes:
        return 100.0 if float(np.min(pnl_arr))>=0 else 0.0
    mu  = np.log(S)+(r-0.5*sigma**2)*T
    sig = sigma*np.sqrt(T)
    if len(bes)>=2:
        lo,hi = min(bes),max(bes)
        return (norm.cdf((np.log(hi)-mu)/sig)-norm.cdf((np.log(lo)-mu)/sig))*100
    p = norm.cdf((np.log(bes[0])-mu)/sig)
    return (1-p)*100 if float(pnl_arr[-1])>0 else p*100

# ─── Datos en vivo ───────────────────────────────────────────────────────────
@st.cache_data(ttl=15)
def get_price(exchange, symbol):
    try:
        if exchange=="Bybit":
            r = requests.get(f"https://api.bybit.com/v5/market/tickers?category=spot&symbol={symbol}",timeout=5)
            return float(r.json()['result']['list'][0]['lastPrice'])
        else:
            r = requests.get(f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}",timeout=5)
            return float(r.json()['price'])
    except:
        return None

@st.cache_data(ttl=60)
def get_iv_bybit(coin):
    try:
        r = requests.get(f"https://api.bybit.com/v5/market/tickers?category=option&baseCoin={coin}",timeout=8)
        ivs=[float(o.get('markIv',0) or 0)*100 for o in r.json()['result']['list'] if float(o.get('markIv',0) or 0)>0]
        return round(float(np.median(ivs)),1) if ivs else None
    except:
        return None

# ─── Session State ────────────────────────────────────────────────────────────
if 'legs' not in st.session_state:
    st.session_state.legs = [
        {"tipo":"call","accion":"buy","strike":78000.0,"prima":20.0,"qty":0.1,"iv":45.0},
        {"tipo":"call","accion":"buy","strike":78000.0,"prima":20.0,"qty":0.1,"iv":45.0},
        {"tipo":"call","accion":"buy","strike":78000.0,"prima":20.0,"qty":0.1,"iv":45.0},
        {"tipo":"call","accion":"buy","strike":78000.0,"prima":20.0,"qty":0.1,"iv":45.0},
    ]
if 'estrategia' not in st.session_state:
    st.session_state.estrategia = "Personalizada"
if 'cursor_precio' not in st.session_state:
    st.session_state.cursor_precio = None

# ─── SIDEBAR ─────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("🦅 Quant Options Lab")
    st.divider()

    exchange = st.selectbox("Exchange", ["Bybit","Binance","Manual"])
    activo   = st.selectbox("Activo",   ["BTC","ETH","SOL","BNB"])
    symbol   = f"{activo}USDT"

    precio_live = get_price(exchange, symbol) if exchange != "Manual" else None
    if precio_live:
        st.success(f"📡 {exchange}: ${precio_live:,.2f}")
    default_precio = precio_live or (78000.0 if activo=="BTC" else 2431.0)

    S   = st.number_input(f"Precio {activo}", value=float(round(default_precio,2)), step=10.0, format="%.2f")
    DTE = st.slider("DTE — Días al vencimiento", 1, 90, 7)

    iv_live = get_iv_bybit(activo) if exchange=="Bybit" else None
    if iv_live:
        st.info(f"📊 IV Bybit: {iv_live:.1f}%")
    IV  = st.slider("IV % global", 5, 250, int(iv_live or 65))
    r   = st.number_input("Tasa libre de riesgo (%)", value=5.0, step=0.5)/100

    st.divider()
    rango = st.slider("Rango gráfico (±%)", 5, 50, 20)

    st.divider()
    if st.button("🔄 Actualizar precios"):
        st.cache_data.clear()
        st.rerun()

# ─── BOTONES DE ESTRATEGIA ────────────────────────────────────────────────────
st.title(f"🦅 {st.session_state.estrategia} — {activo} @ ${S:,.2f}")

w = round(S*0.05/50)*50

ESTRATEGIAS = {
    "🦅 Iron Condor": [
        ("put","buy",S-2*w,10.0,0.7,IV),("put","sell",S-w,20.0,0.7,IV),
        ("call","sell",S+w,20.0,0.7,IV),("call","buy",S+2*w,10.0,0.7,IV)],
    "🦋 Iron Butterfly": [
        ("put","buy",S-w,15.0,0.7,IV),("put","sell",S,40.0,0.7,IV),
        ("call","sell",S,40.0,0.7,IV),("call","buy",S+w,15.0,0.7,IV)],
    "🔰 Broken Wing": [
        ("put","buy",S-3*w,5.0,0.7,IV),("put","sell",S-w,20.0,0.7,IV),
        ("call","sell",S+w,20.0,0.7,IV),("call","buy",S+2*w,10.0,0.7,IV)],
    "📈 Bull Call": [
        ("call","buy",S,50.0,0.1,IV),("call","sell",S+w,20.0,0.1,IV)],
    "📉 Bear Put": [
        ("put","buy",S,50.0,0.1,IV),("put","sell",S-w,20.0,0.1,IV)],
    "💰 DS Call": [
        ("call","buy",S,50.0,0.1,IV),("call","sell",S+w,20.0,0.1,IV)],
    "💰 DS Put": [
        ("put","buy",S,50.0,0.1,IV),("put","sell",S-w,20.0,0.1,IV)],
    "⚡ Straddle": [
        ("call","buy",S,50.0,0.1,IV),("put","buy",S,50.0,0.1,IV)],
    "🌊 Strangle": [
        ("put","buy",S-w,20.0,0.1,IV),("call","buy",S+w,20.0,0.1,IV)],
    "✏️ Personalizada": None,
}

cols = st.columns(len(ESTRATEGIAS))
for i, (nombre, legs_tpl) in enumerate(ESTRATEGIAS.items()):
    with cols[i]:
        if st.button(nombre, key=f"btn_{nombre}"):
            st.session_state.estrategia = nombre
            if legs_tpl:
                st.session_state.legs = [
                    {"tipo":t,"accion":a,"strike":float(sk),"prima":float(pr),"qty":float(q),"iv":float(iv)}
                    for t,a,sk,pr,q,iv in legs_tpl]
            st.session_state.cursor_precio = None
            st.rerun()

st.divider()

# ─── EDITOR DE PATAS ─────────────────────────────────────────────────────────
st.subheader("🛠️ Patas")

# Controles de patas
c_add, c_rem, _ = st.columns([1,1,8])
with c_add:
    if st.button("➕ Pata"):
        st.session_state.legs.append({"tipo":"call","accion":"buy","strike":S,"prima":20.0,"qty":0.1,"iv":float(IV)})
        st.rerun()
with c_rem:
    if st.button("➖ Pata") and len(st.session_state.legs)>1:
        st.session_state.legs.pop()
        st.rerun()

hdr = st.columns([1.2,1,1.5,1.5,1,1])
for h,t in zip(hdr,["Tipo","Acción","Strike","Prima","Qty","IV%"]):
    h.markdown(f"**{t}**")

legs_updated = []
for i, leg in enumerate(st.session_state.legs):
    c = st.columns([1.2,1,1.5,1.5,1,1])
    tipo   = c[0].selectbox(f"Tipo {i}",   ["call","put"],   index=0 if leg["tipo"]=="call" else 1,  key=f"t{i}")
    accion = c[1].selectbox(f"Accion {i}", ["buy","sell"],   index=0 if leg["accion"]=="buy" else 1, key=f"a{i}")
    strike = c[2].number_input(f"Strike {i}", value=float(leg["strike"]), step=50.0, key=f"s{i}")
    prima  = c[3].number_input(f"Prima {i}",  value=float(leg["prima"]),  step=0.5, min_value=0.0, key=f"p{i}")
    qty    = c[4].number_input(f"Qty {i}",    value=float(leg["qty"]),    step=0.1, min_value=0.01, key=f"q{i}")
    iv_leg = c[5].number_input(f"IV {i}",     value=max(1.0, float(leg["iv"])*100 if float(leg["iv"])<=1.0 else float(leg["iv"])),     step=1.0, min_value=1.0,  key=f"iv{i}")
    legs_updated.append({"tipo":tipo,"accion":accion,"strike":strike,"prima":prima,"qty":qty,"iv":iv_leg})

st.session_state.legs = legs_updated
legs = legs_updated

# ─── CÁLCULOS ────────────────────────────────────────────────────────────────
T     = DTE/365.0
sigma = IV/100.0
N     = 800
lo,hi = S*(1-rango/100), S*(1+rango/100)
precios = np.linspace(lo, hi, N)

pnl_venc   = np.zeros(N)
pnl_actual = np.zeros(N)
tot = {"delta":0.0,"gamma":0.0,"theta":0.0,"vega":0.0}

for leg in legs:
    mult = 1 if leg["accion"]=="buy" else -1
    g = bs(S, leg["strike"], T, r, leg["iv"]/100, leg["tipo"])
    for k in tot:
        tot[k] += g[k]*leg["qty"]*mult*100

    val_venc = (np.maximum(precios-leg["strike"],0) if leg["tipo"]=="call"
                else np.maximum(leg["strike"]-precios,0))
    pnl_venc += ((val_venc-leg["prima"])*leg["qty"] if leg["accion"]=="buy"
                 else (leg["prima"]-val_venc)*leg["qty"])

    for j,p in enumerate(precios):
        g_p = bs(p,leg["strike"],T,r,leg["iv"]/100,leg["tipo"])
        pnl_actual[j] += (g_p["precio"]-leg["prima"])*leg["qty"]*mult

# Break-evens
bes = []
for i in np.where(np.diff(np.sign(pnl_venc)))[0]:
    diff = pnl_venc[i+1]-pnl_venc[i]
    if diff:
        bes.append(precios[i]-pnl_venc[i]*(precios[i+1]-precios[i])/diff)

max_p = float(np.max(pnl_venc))
max_l = float(np.min(pnl_venc))
pop   = calc_pop(S,r,sigma,T,bes,pnl_venc)
cred  = sum((leg["prima"] if leg["accion"]=="sell" else -leg["prima"])*leg["qty"] for leg in legs)

# ─── MÉTRICAS ────────────────────────────────────────────────────────────────
st.divider()
m = st.columns(7)
m[0].metric("Máx. Ganancia",  f"${max_p:,.2f}")
m[1].metric("Máx. Pérdida",   f"${max_l:,.2f}")
m[2].metric("PoP",            f"{pop:.1f}%")
m[3].metric("Theta/día",      f"${tot['theta']:.2f}")
m[4].metric("Delta",          f"{tot['delta']:.2f}")
m[5].metric("Vega /1%IV",     f"${tot['vega']:.2f}")
m[6].metric("Crédito/Débito", f"${cred:,.2f}")

# PnL en cursor si existe
if st.session_state.cursor_precio:
    px_c = st.session_state.cursor_precio
    pnl_c = float(np.interp(px_c, precios, pnl_venc))
    pnl_h = float(np.interp(px_c, precios, pnl_actual))
    emoji = "✅" if pnl_c >= 0 else "❌"
    st.info(f"📍 Cursor en **${px_c:,.0f}** → PnL vencimiento: **{emoji} ${pnl_c:,.2f}** | PnL hoy: **${pnl_h:,.2f}**")

# ─── TABS ────────────────────────────────────────────────────────────────────
tab1,tab2,tab3,tab4 = st.tabs(["📈 Payoff","⏰ Theta Decay","🌊 Mapa IV×Precio","📊 Griegas"])

dark = dict(template="plotly_dark", plot_bgcolor='rgba(0,0,0,0)',
            paper_bgcolor='rgba(0,0,0,0)', margin=dict(l=10,r=10,t=30,b=10))

# ── Payoff ────────────────────────────────────────────────────────────────────
with tab1:
    fig = go.Figure()

    # Zonas color
    fig.add_trace(go.Scatter(
        x=np.concatenate([precios,precios[::-1]]),
        y=np.concatenate([np.maximum(pnl_venc,0),np.zeros(N)]),
        fill='toself',fillcolor='rgba(166,227,161,0.12)',
        line=dict(color='rgba(0,0,0,0)'),showlegend=False,hoverinfo='skip'))
    fig.add_trace(go.Scatter(
        x=np.concatenate([precios,precios[::-1]]),
        y=np.concatenate([np.minimum(pnl_venc,0),np.zeros(N)]),
        fill='toself',fillcolor='rgba(243,139,168,0.12)',
        line=dict(color='rgba(0,0,0,0)'),showlegend=False,hoverinfo='skip'))

    # Curvas
    fig.add_trace(go.Scatter(x=precios,y=pnl_venc,mode='lines',
        line=dict(color='#cdd6f4',width=2.5),name='Al vencimiento',
        hovertemplate='$%{x:,.0f} → $%{y:.2f}<extra></extra>'))
    fig.add_trace(go.Scatter(x=precios,y=pnl_actual,mode='lines',
        line=dict(color='#89b4fa',width=1.5,dash='dot'),name=f'Hoy (DTE {DTE})',
        hovertemplate='$%{x:,.0f} → $%{y:.2f}<extra></extra>'))

    # Líneas de referencia
    fig.add_hline(y=0,line_dash="dash",line_color="gray",opacity=0.4)
    fig.add_vline(x=S,line_dash="dot",line_color="#a6e3a1",
                  annotation_text=f"{activo} ${S:,.0f}",annotation_position="top right")
    for be in bes:
        fig.add_vline(x=be,line_dash="dash",line_color="#f38ba8",
                      annotation_text=f"BE ${be:,.0f}",annotation_font_size=11)

    # Línea del cursor si existe
    if st.session_state.cursor_precio:
        px_c = st.session_state.cursor_precio
        pnl_c = float(np.interp(px_c,precios,pnl_venc))
        fig.add_vline(x=px_c,line_dash="solid",line_color="#f9e2af",line_width=2,
                      annotation_text=f"📍${px_c:,.0f}<br>${pnl_c:,.2f}",
                      annotation_position="top left",annotation_font_size=11)

    # Líneas verticales de strikes
    strikes_vistos = set()
    for leg in legs:
        if leg["strike"] not in strikes_vistos:
            color = "#a6e3a1" if leg["accion"]=="buy" else "#f38ba8"
            simbolo = "▲ BUY" if leg["accion"]=="buy" else "▼ SELL"
            fig.add_vline(x=leg["strike"],line_dash="dot",line_color=color,
                          opacity=0.5,line_width=1,
                          annotation_text=f"{simbolo} {leg['tipo'].upper()} ${leg['strike']:,.0f}",
                          annotation_font_size=10,annotation_position="bottom right")
            strikes_vistos.add(leg["strike"])

    fig.update_layout(**dark,height=500,
        xaxis_title=f"Precio {activo}",yaxis_title="PnL (USDT)",
        xaxis=dict(tickformat="$,.0f"),yaxis=dict(tickformat="$,.2f"),
        legend=dict(orientation="h",y=1.08),
        hovermode="x unified",
        clickmode="event")

    # Capturar click en gráfica
    clicked = st.plotly_chart(fig, use_container_width=True, key="payoff_main",
                               on_select="rerun", selection_mode="points")

    if clicked and hasattr(clicked,'selection') and clicked.selection:
        pts = clicked.selection.get('points',[])
        if pts:
            nuevo_px = pts[0].get('x')
            if nuevo_px:
                st.session_state.cursor_precio = nuevo_px
                st.rerun()

    # Slider de cursor manual
    cursor_val = st.slider(
        "🖱️ Mover cursor de precio",
        min_value=float(lo), max_value=float(hi),
        value=float(st.session_state.cursor_precio or S),
        step=float((hi-lo)/200),
        format="$%.0f",
        key="cursor_slider"
    )
    if cursor_val != (st.session_state.cursor_precio or S):
        st.session_state.cursor_precio = cursor_val
        st.rerun()

    pnl_cursor_v = float(np.interp(cursor_val,precios,pnl_venc))
    pnl_cursor_h = float(np.interp(cursor_val,precios,pnl_actual))
    cv1,cv2,cv3 = st.columns(3)
    cv1.metric(f"Precio en cursor",f"${cursor_val:,.0f}")
    cv2.metric("PnL al vencimiento",f"${pnl_cursor_v:,.2f}",
               delta="✅ Ganancia" if pnl_cursor_v>=0 else "❌ Pérdida")
    cv3.metric("PnL hoy",f"${pnl_cursor_h:,.2f}")

    if bes:
        st.info(f"Break-evens: {' | '.join(f'${b:,.0f}' for b in sorted(bes))}")


# ── Theta Decay ───────────────────────────────────────────────────────────────
with tab2:
    dias_sim  = list(range(DTE,0,-1))
    pnl_decay = []
    for d in dias_sim:
        p = sum((bs(S,l["strike"],d/365.0,r,l["iv"]/100,l["tipo"])["precio"]-l["prima"])
                *l["qty"]*(1 if l["accion"]=="buy" else -1) for l in legs)
        pnl_decay.append(p)

    fig2 = go.Figure()
    fig2.add_trace(go.Scatter(x=dias_sim,y=pnl_decay,mode='lines+markers',
        line=dict(color='#89b4fa',width=2),
        marker=dict(color=['#a6e3a1' if p>=0 else '#f38ba8' for p in pnl_decay],size=5),
        hovertemplate='DTE %{x} → $%{y:.2f}<extra></extra>',name='PnL'))
    fig2.add_hline(y=0,line_dash="dash",line_color="gray",opacity=0.4)
    fig2.update_layout(**dark,height=400,
        xaxis=dict(autorange="reversed",title="Días al vencimiento"),
        yaxis=dict(title="PnL (USDT)",tickformat="$,.2f"))
    st.plotly_chart(fig2,use_container_width=True)

    st.subheader("Tabla de decay")
    step = max(1,len(dias_sim)//15)
    for i in range(0,len(dias_sim),step):
        d,p = dias_sim[i],pnl_decay[i]
        emoji = "✅" if p>=0 else "❌"
        st.write(f"DTE {d:3d} → {emoji} ${p:,.2f}")


# ── Mapa IV×Precio ────────────────────────────────────────────────────────────
with tab3:
    ivs_esc = np.linspace(max(5,IV-30),min(200,IV+30),20)
    ps_esc  = np.linspace(S*0.82,S*1.18,25)
    matrix  = np.zeros((len(ivs_esc),len(ps_esc)))
    for i,iv_e in enumerate(ivs_esc):
        for j,p_e in enumerate(ps_esc):
            matrix[i,j] = sum(
                (bs(p_e,l["strike"],T,r,iv_e/100,l["tipo"])["precio"]-l["prima"])
                *l["qty"]*(1 if l["accion"]=="buy" else -1) for l in legs)

    fig3 = go.Figure(data=go.Heatmap(
        z=matrix,
        x=[f"${p:,.0f}" for p in ps_esc],
        y=[f"{iv:.0f}%" for iv in ivs_esc],
        colorscale=[[0,'#f38ba8'],[0.45,'#f38ba8'],[0.5,'#313244'],[0.55,'#a6e3a1'],[1,'#a6e3a1']],
        zmid=0,colorbar=dict(title="PnL USDT"),
        text=[[f"${v:.1f}" for v in row] for row in matrix],
        texttemplate="%{text}",textfont={"size":9},
        hovertemplate='Precio: %{x}<br>IV: %{y}<br>PnL: $%{z:.2f}<extra></extra>'))
    fig3.update_layout(**dark,height=500,
        xaxis_title=f"Precio {activo}",yaxis_title="IV (%)")
    st.plotly_chart(fig3,use_container_width=True)
    st.caption("🟢 Verde = ganancia | 🔴 Rojo = pérdida")


# ── Griegas ───────────────────────────────────────────────────────────────────
with tab4:
    g1,g2,g3,g4 = st.columns(4)
    g1.metric("Delta (Δ)", f"{tot['delta']:.3f}")
    g2.metric("Gamma (Γ)", f"{tot['gamma']:.5f}")
    g3.metric("Vega (𝒱)",  f"${tot['vega']:.3f}")
    g4.metric("Theta (Θ)", f"${tot['theta']:.3f}/día")

    deltas_p = []
    for p in precios:
        d = sum(bs(p,l["strike"],T,r,l["iv"]/100,l["tipo"])["delta"]
                *l["qty"]*(1 if l["accion"]=="buy" else -1)*100 for l in legs)
        deltas_p.append(d)

    fig4 = go.Figure()
    fig4.add_trace(go.Scatter(x=precios,y=deltas_p,mode='lines',
        line=dict(color='#f9e2af',width=2),
        hovertemplate='$%{x:,.0f} → Δ: %{y:.3f}<extra></extra>',name='Delta'))
    fig4.add_hline(y=0,line_dash="dash",line_color="gray",opacity=0.4)
    fig4.add_vline(x=S,line_dash="dot",line_color="#a6e3a1")
    fig4.update_layout(**dark,height=300,
        xaxis_title=f"Precio {activo}",yaxis_title="Delta portafolio")
    st.plotly_chart(fig4,use_container_width=True)

    st.subheader("Escenarios al vencimiento")
    for pct in [-15,-10,-5,-2,0,2,5,10,15]:
        p_e = S*(1+pct/100)
        pnl_e = sum(
            ((max(0,p_e-l["strike"]) if l["tipo"]=="call" else max(0,l["strike"]-p_e))-l["prima"])
            *l["qty"]*(1 if l["accion"]=="buy" else -1) for l in legs)
        emoji = "✅" if pnl_e>0 else ("⚠️" if abs(pnl_e)<0.5 else "❌")
        st.write(f"{emoji} {'+' if pct>=0 else ''}{pct}% → ${p_e:,.0f} → **${pnl_e:,.2f}**")

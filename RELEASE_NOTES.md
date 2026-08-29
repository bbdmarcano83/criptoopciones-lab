# CriptoOpciones LAB Professional — Release 2.0

## Transformación aplicada
- Terminal dedicada exclusivamente a BTC y ETH.
- Bybit y Deribit como venues públicos normalizados.
- Analizador, Riesgo/Posiciones, Cadena, Volatilidad, Ajuste/Roll y Diario con responsabilidades separadas.
- Interfaces legacy consolidadas mediante redirección a `index.html`.
- Motor único de exchange: `exchange_engine.js`.
- Motor único de histórico/IVR: `iv_engine.js`.
- Motor de analytics: `market_engine.js`.
- Volatilidad: term structure ATM, skew 25Δ, liquidity score, Market Regime, Opportunity Score y comparación Bybit/Deribit.
- Analizador: Market Regime contextual; la cadena completa se movió a su página especializada.
- Posiciones: reemplazo del IV fijo 60% por IV de mercado del venue seleccionado.
- Diario: IVR desconocido se conserva como N.D. en vez de asumir 50%.
- Manual profesional actualizado.

## Compatibilidad preservada
- Nombres principales de páginas.
- Plantillas/payoff del Analizador.
- Bot V5 y sus endpoints existentes.
- Acciones de posición/roll/cierre existentes.
- LocalStorage de estrategias y diario.

## Límite explícito
La capa de mercado Deribit está funcionalmente preparada con endpoints públicos. La ejecución real en Deribit NO se finge: requiere que el backend Bot V5 implemente autenticación y endpoints privados Deribit. Hasta entonces, el botón de ejecución sigue dependiendo del backend configurado.

## Verificación realizada
- Sintaxis de todos los JS externos con `node --check`.
- Sintaxis de scripts inline de todas las páginas principales.
- Verificación de dependencias locales y enlaces HTML.
- La sesión de build no tuvo acceso DNS para ejecutar llamadas reales desde el contenedor; los endpoints fueron contrastados con la documentación oficial actual de Bybit y Deribit.

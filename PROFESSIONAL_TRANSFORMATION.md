# CriptoOpciones LAB — Professional BTC/ETH Terminal

## Objetivo
Transformación de la app en una terminal especializada en opciones BTC/ETH, sin páginas que compitan por la misma función.

## Responsabilidades
- `index.html`: Analizador de estrategias y preparación de ejecución.
- `positions.html`: Riesgo y posiciones reales del Bot V5.
- `chain.html`: Explorador de cadena y selección de contratos.
- `iv.html`: Volatilidad, term structure, skew, market regime y comparación de venues.
- `ajuste.html`: Ajuste / roll.
- `diario.html`: Diario y estadísticas.
- `manual.html`: documentación operativa.
- `CriptoOpciones_Lab.html` y `quant_options_lab.html`: redirecciones legacy; ya no duplican la terminal.

## Core profesional
- `exchange_engine.js`: Bybit + Deribit, schema normalizado BTC/ETH.
- `iv_engine.js`: histórico por exchange/activo/tenor, IVR/percentile 52W sin rangos inventados.
- `market_engine.js`: ATM IV, term structure, 25Δ skew, liquidez, régimen y Opportunity Score.
- `co_shared.js`: estado, Black-Scholes, utilidades y navegación.
- `co_bot.js`: conexión existente con Bot V5.

## Fuente y metodología
Bybit: `instruments-info` para instrumentos y `tickers` para datos de mercado. Deribit: `get_instruments`, `get_book_summary_by_currency` y `get_index_price`. La terminal no sustituye historical volatility realizada por histórico de implied volatility.

## Nota sobre IVR
Se muestra IVR 52W sólo cuando el histórico propio contiene cobertura real suficiente. Antes: `-- / ⏳`.

## Ejecución
La capa pública multi-exchange NO envía órdenes. La ejecución continúa por Bot V5. Para ejecutar en Deribit, el backend Bot V5 necesitará un adaptador privado/autenticado Deribit; esta versión deja la terminal de mercado preparada sin fingir soporte de órdenes que el backend todavía no expone.

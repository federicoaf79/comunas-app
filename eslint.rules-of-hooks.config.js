// eslint.rules-of-hooks.config.js
// Gate de build — corre SOLO react-hooks/rules-of-hooks, nada más.
//
// eslint.config.js (la config completa del proyecto) ya trae esta
// regla en "error" vía reactHooks.configs.flat.recommended, pero
// también trae otras reglas de ese mismo preset (react-hooks/
// set-state-in-effect, no-unused-vars, etc.) que hoy tienen deuda
// preexistente en el repo. Correr `eslint .` completo como paso de
// build rompería el deploy por esa deuda, no por hooks mal usados —
// exactamente lo que NO se pidió. Esta config aislada solo activa
// rules-of-hooks, así el gate de build es específico a esa regla y
// no se ve afectado por el resto.
//
// Los plugins react-hooks/react-refresh se registran igual (sin
// extender sus reglas) para que los comentarios
// `eslint-disable-next-line react-refresh/...` que ya existen en el
// código no revienten con "Definition for rule ... was not found" —
// sin ningún plugin registrado, ESLint no puede resolver a qué regla
// se refiere el comentario, y eso cuenta como error propio aunque la
// regla en sí nunca esté activa acá.
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    languageOptions: {
      ecmaVersion: 2020,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    linterOptions: {
      // Los disable-comments de otras reglas (no-unused-vars,
      // exhaustive-deps, etc.) son válidos en la config completa del
      // proyecto — acá, con casi ninguna regla activa, van a aparecer
      // como "unused" sin serlo realmente. No es señal de nada.
      reportUnusedDisableDirectives: false,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
    },
  },
])

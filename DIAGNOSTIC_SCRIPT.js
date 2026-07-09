// COMUNAS - DIAGNOSTIC SCRIPT
// Copiar este código completo y pegarlo en la consola del browser (F12)
// mientras estás en admin.comunas.lat con spinners infinitos

console.log('🔍 COMUNAS DIAGNOSTIC SCRIPT - Iniciando...');

// 1. Verificar si React Query está activo
try {
  const queryCache = window.__REACT_QUERY_DEVTOOLS_GLOBALDEVHOOK__?.queryClient?.getQueryCache();
  if (queryCache) {
    console.log('✅ React Query detectado');
    const queries = queryCache.getAll();
    console.log(`📊 Total queries en cache: ${queries.length}`);

    // Agrupar por estado
    const byStatus = queries.reduce((acc, q) => {
      const status = q.state.status;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    console.table(byStatus);

    // Mostrar queries pending/error
    const problematic = queries.filter(q =>
      q.state.status === 'pending' || q.state.status === 'error'
    );

    if (problematic.length > 0) {
      console.warn(`⚠️ ${problematic.length} queries con problemas:`);
      problematic.forEach(q => {
        console.group(`Query: ${JSON.stringify(q.queryKey)}`);
        console.log('Estado:', q.state.status);
        console.log('Error:', q.state.error);
        console.log('fetchStatus:', q.state.fetchStatus);
        console.log('dataUpdateCount:', q.state.dataUpdateCount);
        console.log('errorUpdateCount:', q.state.errorUpdateCount);
        console.groupEnd();
      });
    }
  } else {
    console.error('❌ React Query no detectado - ¿devtools instaladas?');
  }
} catch (e) {
  console.error('❌ Error accediendo a React Query:', e);
}

// 2. Verificar AuthContext
try {
  // Buscar el nodo raíz de React
  const root = document.getElementById('root');
  if (root && root._reactRootContainer) {
    console.log('✅ React root detectado');
  }
} catch (e) {
  console.error('❌ Error accediendo a React:', e);
}

// 3. Verificar Supabase client
try {
  if (window.supabase) {
    console.log('✅ Supabase client global detectado');
  } else {
    console.warn('⚠️ Supabase client no encontrado en window');
  }
} catch (e) {
  console.error('❌ Error verificando Supabase:', e);
}

// 4. Verificar errores de red
console.log('🌐 Revisando errores de red recientes...');
console.log('Abrí la pestaña Network en DevTools para ver requests fallidos');

// 5. Verificar localStorage/sessionStorage
try {
  const authKey = localStorage.getItem('comunas-auth');
  const perfilCache = sessionStorage.getItem('comunas_perfil');

  if (authKey) {
    console.log('✅ comunas-auth encontrado en localStorage');
    try {
      const auth = JSON.parse(authKey);
      console.log('Usuario logueado:', auth.user?.email || 'no encontrado');
    } catch {}
  } else {
    console.warn('⚠️ comunas-auth NO encontrado en localStorage');
  }

  if (perfilCache) {
    console.log('✅ comunas_perfil encontrado en sessionStorage');
    try {
      const perfil = JSON.parse(perfilCache);
      console.log('Perfil:', {
        id: perfil.id,
        nombre: perfil.nombre,
        roles: perfil.roles,
        municipio_id: perfil.municipio_id
      });
    } catch {}
  } else {
    console.warn('⚠️ comunas_perfil NO encontrado en sessionStorage');
  }
} catch (e) {
  console.error('❌ Error accediendo a storage:', e);
}

// 6. Test query directo a Supabase
console.log('🧪 Testeando query directo a Supabase...');
const testQuery = async () => {
  try {
    const SUPABASE_URL = 'https://tuvfrnjnupfurzkepsod.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dmZybmpudXBmdXJ6a2Vwc29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY5NTI1NDYsImV4cCI6MjA1MjUyODU0Nn0.OT6aNPEqXN6qbqfU2kXLl5sOGM9g3vvvE2VhKm-e3qw';

    const response = await fetch(`${SUPABASE_URL}/rest/v1/vecinos?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (response.ok) {
      console.log('✅ Query directo a vecinos OK:', await response.json());
    } else {
      console.error('❌ Query directo falló:', response.status, await response.text());
    }
  } catch (e) {
    console.error('❌ Error en test query:', e);
  }
};

testQuery();

console.log('✅ DIAGNOSTIC SCRIPT completado. Revisar output arriba.');
console.log('📋 Próximos pasos:');
console.log('1. Revisar queries "pending" o "error" arriba');
console.log('2. Abrir pestaña Network y buscar requests rojos (failed)');
console.log('3. Si hay un error de CORS o 401, el problema es auth/permissions');
console.log('4. Si hay un error de column does not exist, el problema es schema');

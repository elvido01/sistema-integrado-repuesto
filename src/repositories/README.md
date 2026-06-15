# `src/repositories/`

Capa de acceso a datos. Encapsula todas las llamadas a Supabase con un patrón consistente.

## Estructura

```
repositories/
├── shared/
│   ├── errorHandler.js          - normalizeSupabaseError, runRepo, runRpc
│   └── secuenciasRepository.js  - get_next_*_numero centralizado
├── catalogo/
│   ├── clientesRepository.js
│   ├── proveedoresRepository.js
│   └── vendedoresRepository.js
└── inventario/
    └── productosRepository.js
```

(En crecimiento — Fases siguientes agregan `ventas/`, `compras/`, `dgii/`, `financiero/`).

## Convención

Cada método retorna `{ data, error }` normalizado:

- `data` es el resultado o `null` si falló
- `error` es `null` si OK; si no, `{ title, message, code, status, hint }`

## Uso

```js
import productosRepository from '@/repositories/inventario/productosRepository';
import { useToast } from '@/components/ui/use-toast';

function MyComponent() {
  const { toast } = useToast();

  const handleSearch = async (codigo) => {
    const { data, error } = await productosRepository.getByCodigo(codigo);
    if (error) {
      toast({ variant: 'destructive', title: error.title, description: error.message });
      return;
    }
    if (!data) {
      toast({ title: 'No encontrado', description: `No existe producto con codigo ${codigo}` });
      return;
    }
    setProducto(data);
  };
}
```

## Reglas

- **No mezclar UI** — los repositories nunca llaman `toast()` ni `console.log`. Solo devuelven datos.
- **El filtro por tenant viene de RLS / RPCs** — no se replica en el cliente.
- **Una función por uso semántico**, no por query — `getActivos()` mejor que `getAll({ activo: true })` para usos comunes.
- **Tipos JSDoc obligatorios** — facilita autocompletado.
- **No throw**, no Promise rejection — el wrapper `runRepo` captura y normaliza.

## Migración progresiva

No hay que refactorizar todos los archivos de una vez. Las páginas/hooks existentes siguen llamando a `supabase` directo. Cada vez que se toque un archivo por otra razón, migrar las llamadas relevantes al repository correspondiente.

Estado de migración (a Fase 2.5):
- `useVentas.js` — no migrado (Fase 3 con repository de ventas)
- `OrdenCompraPage.jsx` — no migrado (Fase 3 con repository de compras)
- `ComprasPage.jsx` — no migrado
- `sendToOrdenCompra.js` — candidato a usar `productosRepository.getById`

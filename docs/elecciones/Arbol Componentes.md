# Árbol de Componentes React - Feature-Sliced Design (FSD).

## Árbol de Componentes: Módulo de Elecciones

```Plaintext
src/app/[residenciaId]/elegir-horarios-comida/
├── page.tsx (Server Component)
│   # RESPONSABILIDAD: Punto de entrada. Verifica permisos básicos, lee la 
│   # zona horaria de la residencia y calcula el string de la fecha actual 
│   # (hoy) para pasárselo al cliente. No hace fetch de la BD.
│   │
│   └── _components/VistaHorariosCliente.tsx (Client Component)
│       # RESPONSABILIDAD: Orquestador principal. 
│       # Invoca `useHorariosUI` (TanStack Query). 
│       # Muestra skeletons de carga mientras se hace el fetch.
│       │
│       ├── _components/BarraSuplantacion.tsx (Client Component)
│       │   # Lee y escribe en Zustand (`useImpersonatorStore`) el `targetUid`.
│       │
│       ├── _components/BannerNovedades.tsx (Client Component)
│       │   # Hace un fetch ligero independiente para contar las novedades
│       │   # operativas de la semana actual.
│       │
│       ├── _components/CarruselCalendario.tsx (Client Component)
│       │   # Recibe: `actividades[]` (del Payload Principal) y fechaSeleccionada.
│       │   # Renderiza: La banda de días y las líneas/puntos de actividades.
│       │   # Interacción: Al tocar un día, actualiza el estado local (Zustand) 
│       │   # para mover el CarruselDiario.
│       │
│       ├── _components/CarruselDiario.tsx (Client Component)
│       │   # Recibe: `dias[]` (El arreglo denso de 7 días).
│       │   # Usa Framer Motion o Swiper.js para el gesto de "swipe" horizontal.
│       │   │
│       │   └── _components/DiaHorario.tsx (Client Component - renderizado N veces)
│       │       # Itera sobre las tarjetas de un día específico.
│       │       │
│       │       └── _components/TarjetaComida/ContenedorTarjeta.tsx (Client Component)
│       │           # Recibe: `TarjetaComidaUI` (DTO).
│       │           # Maneja el estado `isOpen` del Drawer inferior.
│       │           │
│       │           ├── _components/TarjetaComida/TarjetaSuperficie.tsx
│       │           │   # UI UI/UX: Solo renderiza colores, el Fail-Close, 
│       │           │   # y el ícono de estado (Candado/Alerta). Sin lógica pesada.
│       │           │
│       │           └── _components/TarjetaComida/CajonDetalle.tsx
│       │               # UI UI/UX: El Bottom Sheet (Drawer).
│       │               # Muestra el `mensajeFormativo` si está bloqueado.
│       │               # Si el estado es MUTABLE, renderiza el selector de opciones.
│       │               # Invoca el hook `useMutacionOptimista` al guardar.
│       │
│       └── _components/BotonAccionRadial.tsx (Client Component)
│           # El FAB estático en la esquina inferior derecha.
│           # Maneja los estados `isOpen` de los tres modales.
│           │
│           ├── _components/Modales/ModalAusenciaLote.tsx
│           │   # Formulario que valida fechas (Zod). 
│           │   # Invoca la Server Action `upsertAusenciaLote`.
│           │
│           ├── _components/Modales/ModalExcepcionLibre.tsx
│           │   # Formulario completo (Fecha -> Tiempo -> Opción). 
│           │   # Invoca la Server Action `upsertExcepcion`.
│           │
│           └── src/components/novedades/NovedadFormModal.tsx (Shared Component)
│               # Reutilizado globalmente. Al hacer submit exitoso, 
│               # se invalida la caché del BannerNovedades.
```

## Gestión de Estado (El "Pegamento")
Para que este árbol de componentes tan profundo no sufra de Prop Drilling (pasar props a través de 5 niveles), propongo esta división estricta del estado:

1. **Estado del Servidor (TanStack Query):**
Maneja exclusivamente los DTOs de lectura. Se invoca en la raíz cliente (VistaHorariosCliente.tsx) y se pasa hacia abajo.

2. **Estado Local de UI (Zustand - _hooks/useHorariosStore.ts):**
Maneja cosas efímeras que necesitan sincronizarse entre ramas distantes.
    + fechaEnFoco: Sincroniza el CarruselCalendario (arriba) con el CarruselDiario (al medio).

3. **Estado Global de Aplicación (Zustand - src/store/impersonatorStore.ts):**
El targetUid y targetRol viven fuera del módulo, ya que si un director cambia de usuario, debe reflejarse en toda la web app (ej. si luego navega al módulo de Mensajes).

## Consideraciones Clave de Implementación (Para tus desarrolladores)
El componente CajonDetalle.tsx (Drawer): Este componente NO debe montarse (o al menos no renderizar su contenido) hasta que el usuario toca la TarjetaSuperficie. Si montamos 21 drawers ocultos (3 comidas x 7 días) con todos sus selectores de estado al mismo tiempo, el celular sufrirá un impacto de rendimiento masivo (DOM overload). Debe usarse Lazy Evaluation o montado condicional ({isOpen && <ContenidoDrawer />}).

El useMutacionOptimista.ts: Este hook personalizado debe encapsular la complejidad de TanStack Query (onMutate, onError, onSettled). Cuando el residente cambia el almuerzo en el CajonDetalle, el hook debe actualizar la caché de TanStack Query localmente y cerrar el drawer al instante. Si la Server Action devuelve error: 'MURO_MOVIL_CERRADO', el hook hace el rollback silencioso y dispara un Toast de error.


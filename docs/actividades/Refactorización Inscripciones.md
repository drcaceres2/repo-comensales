# Documento de Arquitectura: UI y Flujo de Datos para Invitaciones (Capa 1.5 - Anexo)

Este documento define la estrategia de interfaz de usuario y consumo de datos para el sistema de invitaciones a actividades. El objetivo es proporcionar una experiencia de búsqueda instantánea (Fuzzy Search) sin comprometer la cuota de lecturas de Firestore ni la integridad de la colección principal de usuarios.

### 1. El Anti-Patrón de Búsqueda en Tiempo Real
**Restricción Estricta:** Queda terminantemente prohibido atar inputs de texto a consultas directas de Firestore (`where('nombre', '>=', texto)`) bajo eventos `onChange`.
* **Justificación:** Este enfoque multiplicaría exponencialmente el costo de lecturas y saturaría la red con peticiones redundantes por cada pulsación de tecla, violando los principios de escalabilidad del sistema.

### 2. Estrategia de Caché y Filtrado en Memoria
Para manejar el directorio de residentes (entre 50 y 50
0 usuarios promedio por tenant), se adopta un patrón de **Descarga Única y Filtrado en Cliente**:
* **Capa de Transporte:** Uso de TanStack Query para invocar el Server Action `obtenerDirectorioUsuarios(residenciaId)`.
* **Política de Caché:** El diccionario de usuarios se almacena en la memoria del navegador con un `staleTime` alto (ej. 15-30 minutos). Múltiples aperturas del modal de invitación consumen 0 lecturas adicionales a la base de datos.
* **Motor de Búsqueda:** El componente `Combobox` interactúa exclusivamente con la caché en memoria, proporcionando resultados instantáneos y de costo cero.

### 3. Separación de Privilegios en la UI (Fricción Positiva)
Para prevenir que los usuarios base (residentes) contaminen la base de datos generando *Shadow Accounts* con nombres inválidos o duplicados, la interfaz se bifurca según el rol del usuario que opera la vista:

#### A. Flujo del Residente (Modo Estricto)
* **Componente:** `ComboboxDirectorio` (Estricto/No-creatable).
* **Regla de Negocio:** Un residente solo puede invitar a identidades que ya existan en la base de datos (otros residentes o invitados históricos).
* **Fricción Intencional:** Si el residente desea traer a un invitado externo completamente nuevo, debe solicitarlo físicamente/fuera de línea al Organizador. Esto protege la base de datos de entropía.
* **Payload de Salida:** El formulario siempre emitirá un `usuarioId` válido hacia el Server Action.

#### B. Flujo del Organizador (Modo Privilegiado / "Modo Dios")
* **Componentes:** `ComboboxDirectorio` + Control `[+ Añadir Invitado Externo]`.
* **Regla de Negocio:** El organizador tiene la autoridad de inyectar nueva "Demanda Nominal" al sistema.
* **Comportamiento:** El control de "Añadir Invitado" no filtra la base de datos; despliega un input de texto libre (Dialog/Popover) diseñado explícitamente para capturar el nombre de una nueva identidad.
* **Payload de Salida:** El formulario emite un `string` plano con el nombre. El Server Action orquestará una transacción atómica de dos pasos: (1) Crear la *Shadow Account* y (2) Registrar la `InscripcionActividad` asociándola al nuevo ID generado.

### 4. Contrato de Integridad (Single Source of Truth)
Independientemente de la vía utilizada en la UI (Selección estricta o Creación privilegiada), el esquema de base de datos (`InscripcionActividadSchema`) permanece inmutable: **No existen inscripciones sin ID**. Todo plato servido nominalmente en la "Cascada de la Verdad" estará respaldado por un documento en la colección de usuarios, garantizando la trazabilidad financiera y logística.
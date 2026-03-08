# Especificación de Dominio y Reglas de Negocio

**Versión del documento:** 2.0
**Proyecto:** comensales.app
**Propósito del documento:** Definir los invariantes de negocio y la lógica de resolución de estados para el desarrollo del backend y frontend.
**Objetivo general de la web app:** Gestión de horarios de comida en residencias, centros universitarios y colegios mayores.

## 1. Glosario de Entidades Únicas

Para evitar ambigüedad en la generación de interfaces, validaciones (Zod) y esquemas de base de datos.

### 1.1 Identidades e Intervinientes
* **Usuario:** Cada persona usando el sistema. Sus permisos se derivan de su `RolUsuario` (`master`, `admin`, `director`, `residente`, `invitado`, `asistente`, `contador`).
* **Residencia (Tenant):** Entidad raíz organizativa. Define la `ZonaHoraria` con la que trabajarán todas las fechas de la app y los límites de corte.
* **Administración:** Es la empresa proveedora que se ocupa profesionalmente de la comida y limpieza de la residencia. NO participa en la selección de horarios, solo recibe consolidaciones. (Ente separado, no confundir con el rol 'admin').

### 1.2 Taxonomía de Grupos de Usuarios (Unión Discriminada)
Los usuarios se clasifican bajo grupos estrictos que dictan el comportamiento del sistema y la interfaz:
* **Grupo CONTABLE:** Portan la información financiera (`centroCostoCodigo`, `centroCostoNombre`) y afectan directamente la lógica de imputación de las raciones en el consolidado.
* **Grupo RESTRICTIVO:** Inyectan reglas de comportamiento obligatorias en la experiencia del usuario (ej. activan banderas como `requiereConfirmacionDiaria` o fijan un `horarioLimiteConfirmacion` particular).
* **Grupo ANALÍTICO:** Etiquetas puramente informativas utilizadas para filtros de interfaz o reportería visual, sin impacto en la lógica de resolución.

### 1.3 Entidades del Motor de Horarios (El Singleton)
Estas entidades componen el mapa de disponibilidad del tenant:
* **HorarioSolicitudData:** Define la "Fila Cero" o estructura temporal base y los cortes en los que el director interactúa con la Administración.
* **GrupoComida:** Abstracción para empaquetar momentos del día (ej. agrupa elementos bajo "Desayunos", "Almuerzos", "Cenas").
* **TiempoComida (MealSlot):** Combinación exacta de un día de la semana con un GrupoComida (Ej. "Almuerzo del Miércoles").
* **DefinicionAlternativa:** El catálogo maestro y universal de opciones posibles en la residencia (Ej. "Plato Normal", "Dieta Blanda", "Para Llevar").
* **ConfiguracionAlternativa:** Entidad de cruce (instanciación). Asocia un `TiempoComida` específico con una `DefinicionAlternativa`, determinando qué opciones están vivas para ser elegidas por los usuarios.

## 2. Definición de Roles y Permisos Principales
* **Residente:** Gestiona su intención temporal (`SemanarioUsuario`, `Excepcion`, `Ausencia`) dentro del plazo configurado. Puede reportar una `Novedad Operativa` para el equipo directivo.
* **Director:** Manipula el motor de horarios (Singleton), autoriza eventualidades fuera de plazo, gestiona alteraciones absolutas del entorno y aprueba el Snapshot (Cierre final).
* **Asistente:** Rol delegado. Opera la interfaz actuando en nombre de un residente (por incapacidad o brecha tecnológica) o en nombre del director.
* **Contador:** Acceso restringido y aislado al módulo de grupos `CONTABLE` y visualización de reportes de imputación de costos.
* **Invitado:** Comensal externo. Puede ser registrado en eventos sin cuenta propia (mediante un organizador) o poseer acceso autogestionado temporal.

## 3. Reglas de Negocio: Invariantes de la Cascada y Alteraciones
El núcleo del cálculo de raciones no confía en una sola tabla. Es una proyección calculada sobre la marcha. Las alteraciones de la dirección tienen precedencia absoluta sobre los deseos del residente.

La resolución de estado de un `TiempoComida` evalúa:
1.  **Filtro Administrativo (Capa 0 - Alteraciones):** Evalúa si el servicio fue modificado globalmente. Si la administración "Cierra la cocina" (las opciones activas retornan un arreglo vacío), la cascada deniega cualquier elección del residente y la sustituye forzosamente por la alternativa de contingencia (Ej. "Sin Servicio").
2.  **Jerarquía de Usuario:** Si el filtro administrativo permite operación regular, se evalúa en este orden:
    * **Prioridad Alta:** Inscripción a `Actividad`.
    * **Prioridad Media-Alta:** Registro de `Ausencia`.
    * **Prioridad Media:** Ingreso de `Excepcion` puntual.
    * **Prioridad Baja:** El `SemanarioUsuario` base.
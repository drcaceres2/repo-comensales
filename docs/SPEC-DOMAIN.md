# Especificación de Dominio y Reglas de Negocio

**Versión del documento:** 4.0
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
* **DefinicionAlternativa:** El catálogo maestro y universal de opciones posibles en la residencia (Ej. "Desayuno para llevar", "Almuerzo en el comedor", "Cena tarde").
* **ConfiguracionAlternativa:** Entidad de cruce (instanciación). Asocia un `TiempoComida` específico con una `DefinicionAlternativa`, determinando qué opciones están vivas para ser elegidas por los usuarios. (Ej. "Desayuno para llevar miércoles", "Almuerzo en el comedor domingo", "Cena tarde lunes")

### 1.4 Entidades de la Cascada de la Verdad
* **Semanario:** Expresión de la intención ordinaria del usuario. Es semanal cíclica no amarrada a una fecha.
* **Excepcion:** Intención del usuario que interrumpe el semanario en un momento preciso (tiempo de comida y fecha).
* **Ausencia:** Expresión de la intención del usuario en ausentarse.
* **Actividad:** Evento o plan fuera de lo ordinario que incluye al menos un tiempo de comida, que los directores crean y ponen a disposición de los usuarios para que se inscriban.
* **Inscripción actividad:** Expresión de la intención del usuario a participar de una actividad y por tanto prescindir de los horarios ordinarios

### 1.5 Otras entidades

* **Alteraciones:** Son modificaciones al esquema de horarios del singleton. Se aplican sobre un tiempo de comida, reemplazándolo completamente.
* **Novedades Operativas:** Observaciones que envían los usuarios para que sean incluidas en la comunicación a la administración (puntos de mejora, sugerencias)
* **Recordatorios:** Son entradas del calendario que ayudan al director a hacer la solicitud consolidada (ej: semana de exámenes en una universidad, aniversario importante en la residencia, etc.)
* **Mensajes:** Comunicación de usuario a usuario. Contiene información de contexto sobre quién y en qué modulo (y el ID del documento si existe) escribió el mensaje.
* **Notificaciones:** Comunicación del sistema al usuario.

## 2. Definición de Roles y Permisos Principales
* **Usuario maestro:** Es el único rol que puede crear residencias. También puede crear usuarios en cualqiuer residencia.
* **Usuario 'admin':** No confundir con la **Administración** definida en 1.1, porque no forma parte de ella. Es el usuario que crea usuarios, comedores, y manipula el motor de horarios (Singleton).
* **Director:** Autoriza eventualidades fuera de plazo, gestiona alteraciones absolutas del entorno y genera el Snapshot (Cierre final).
* **Residente:** Gestiona su intención temporal (`SemanarioUsuario`, `Excepcion`, `Ausencia`) dentro del plazo configurado. Puede reportar una `Novedad Operativa` para el equipo directivo.
* **Asistente:** Rol delegado. Opera la interfaz actuando en nombre de un residente (por incapacidad o brecha tecnológica) o en nombre del director.
* **Contador:** Acceso restringido y aislado al módulo de grupos `CONTABLE` y visualización de reportes de imputación de costos.
* **Invitado:** Comensal externo. Puede ser registrado en eventos sin cuenta propia (mediante un organizador) o poseer acceso autogestionado temporal.

## 3. Reglas de Negocio: Invariantes de la Cascada y Alteraciones
El núcleo del cálculo de horarios de comida no confía en una sola tabla. Es una proyección calculada sobre la marcha. Las alteraciones de la dirección tienen precedencia absoluta sobre los deseos del residente.

* Como regla de negocio crítica: la resolución para un usuario en un tiempo de comida es una y solo una alternativa. Es decir no se permite bajo ningún punto que un usuario tenga dos horarios para el almuerzo del mismo día (no tiene derecho a comer dos veces). Existen (y deben existir en cada tiempo de comida) alternativas tipo 'noComoEnCasa' o tipo 'ayuno' que a este respecto se considera una alternativa.

La resolución de estado de un `TiempoComida` evalúa:
1.  **Filtro Administrativo (Capa 0 - Alteraciones):** Evalúa si el servicio fue modificado globalmente. Si la administración "Cierra la cocina" (las opciones activas retornan un arreglo vacío), la cascada deniega cualquier elección del residente y la sustituye forzosamente por la alternativa de contingencia (Ej. "Sin Servicio").
2.  **Jerarquía de Usuario:** Después de aplicar el filtro administrativo, se evalúa en este orden:
    * **Prioridad Alta:** Inscripción a `Actividad`.
    * **Prioridad Media-Alta:** Registro de `Ausencia`.
    * **Prioridad Media:** Ingreso de `Excepcion` puntual.
    * **Prioridad Baja:** El `SemanarioUsuario` base.
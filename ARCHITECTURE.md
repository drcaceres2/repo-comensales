# Documento de Arquiectura: Comensales Residencia

## 1. Objetivos de Negocio y Restricciones Arquitectónicas

### 1.1 Visión del Producto

El sistema "Comensales Residencia" es una plataforma multi-tenant (SaaS) diseñada para la gestión de horarios de comida en residencias universitarias y colegios mayores. Las residencias tienen un enfoque fuerte hacia la formación humana y cultural, ninguna tiene fines de lucro. Por tanto no se manejan con lógica de "el cliente es primero" si no más bien como una familia donde los residentes son estudiantes en un proceso de aprendizaje y formación de su carácter. El sistema opera bajo una lógica de "Fail-Close": ante la duda o inacción, no hay servicio.

### 1.2. Objetivos Estratégicos

1. **Formación del caracter:** El sistema penaliza la falta de planificación. No existen flujos de emergencia automatizados; las excepciones fuera de plazo requieren intervención manual del Director (fricción intencional).
2. **Flexibilidad Cultural (Agnosticismo de Horarios):** El sistema debe soportar cualquier configuración de tiempos de comida (ej. "Brunch", "Asado Viernes", "Merienda") y no estar atado a las constantes tradicionales (Desayuno/Almuerzo/Cena).
3. **Segregación de Negocio:** Estricta separación entre Residencia (Usuarios, Roles, Reglas) y la Administración de la Cocina (Producción). La Administración de la cocina (ordinariamente llamada "la administración") opera como una "Caja Negra" que recibe órdenes consolidadas.

### 1.3. Drivers Arquitectónicos

* Modelo "Plantilla y Excepción": La base de datos no almacena "lo que come cada usuario cada día" por adelantado. Se usa una proyección en tiempo real de un patrón recurrente (Semanario) modificado por excepciones (Ausencias, Actividades).
* Inmutabilidad por Snapshot: La flexibilidad termina cuando el Director "Solicita a Cocina". En ese momento, la realidad dinámica se congela en registros históricos inmutables.
* Manejo de Tiempo Absoluto: Toda lógica obedece a la ZonaHoraria de la Residencia, ignorando la ubicación o reloj del dispositivo del usuario.

## 2. Arquitectura de Datos y Lógica de Resolución

### 2.1. El Algoritmo de Cascada (The Truth Cascade)

El estado de una comida no es un campo estático, sino el resultado de una evaluación jerárquica en tiempo de ejecución (Runtime Resolution).

Jerarquía de Prioridad (de mayor a menor):
1.  **Actividad (Imperativo Institucional):**
    * *Prioridad:* 1 (Máxima).
    * *Lógica:* Si el residente está inscrito en una Actividad para ese bloque horario, la configuración de comida de la Actividad prevalece sobre lo demás (incluso sobre una Ausencia declarada).
    * *Caso de Uso:* Salidas de campo, cenas de gala obligatorias, excursiones, etc.
2.  **Ausencia (Negación de Servicio):**
    * *Prioridad:* 2.
    * *Lógica:* Si no hay Actividad, pero existe un registro de Ausencia para ese rango, el sistema resuelve a "Sin Servicio".
    * *Impacto:* Ignora cualquier elección específica o configuración del semanario.
3.  **Elección Específica (Excepción Voluntaria):**
    * *Prioridad:* 3.
    * *Lógica:* Un registro explícito en la colección `Elecciones` para una fecha `YYYY-MM-DD`. Representa una desviación consciente de la rutina (ej. "Hoy tengo examen y necesito almorzar más tarde").
4.  **Semanario (Plantilla Cíclica / Fallback):**
    * *Prioridad:* 4 (Mínima).
    * *Lógica:* Es la configuración por defecto. Si el motor de resolución llega aquí sin encontrar datos en los niveles 1, 2 o 3, proyecta la configuración del día de la semana correspondiente (ej. "Todos los lunes come opción A").
    * *Mutabilidad:* Cambiar el Semanario afecta a todas las fechas futuras que no tengan una excepción (Niveles 1-3) y que no hayan sido congeladas (Snapshot).

### 2.2. Estrategia de Persistencia: "Snapshotting"

Dado que el cálculo dinámico (2.1) es volátil, el sistema implementa un patrón de **Materialización de Vistas**.

* **Estado "Draft" (Vivo):** En la UI del residente, la celda del calendario es el resultado de la función `f(Actividad, Ausencia, Elección, Semanario)`.
* **Estado "Committed" (Congelado):** Cuando el Director solicita las comidas, el sistema ejecuta la función de resolución y **escribe el resultado final** en un registro histórico inmutable (o marca la elección como definitiva).
    * *Regla de Oro:* Una vez hecho el Snapshot, los cambios en el Semanario o nuevas Actividades NO reescriben el historial de pedidos enviados a cocina.

## 3. Módulos Funcionales y Reglas de Integración

### 3.1. Actividades y Exclusión Mutua

* Mutex: Existe una exclusión mutua lógica entre Actividad y Ausencia. El sistema impide inscribirse a una actividad si hay ausencia vigente y viceversa.
* Locking: Una vez la actividad se solicita a cocina, la lista de inscritos se congela junto con todas las comidas asociadas.

### 3.2 Feedback y Comunicación (Comentarios)

* Task Queue: Los comentarios funcionan como una cola de trabajo para el Director (nuevo -> leido -> diferido -> archivado).
* Persistencia: Los comentarios no desaparecen al leerse; se archivan para trazabilidad histórica.

### 3.3 Estrategia de Contabilidad (Centros de Costo)

El sistema realiza imputación de costos en el momento del Snapshot (Comensal).
* Jerarquía de Resolución de Costo:
	1. Actividad: Si la actividad tiene presupuesto propio, se imputa ahí.
	2. Invitado: Se imputa al centro de costo seleccionado al registrar al invitado (o al del anfitrión por defecto).
	3. Excepción: Si la excepción define un costo específico.
	4. Usuario: Centro de costo por defecto del perfil del residente.

### 3.4 Entidad Core: Comensal (La Fuente de la Verdad)

Nota Técnica: Esta entidad NO representa a la persona. Representa el Ticket de Comida Facturable.
* Propósito: Es el registro inmutable generado tras el cierre del Director.
* Independencia: Contiene copias desnormalizadas de los nombres de platos y menús. Si el menú cambia mañana, el registro Comensal de ayer permanece intacto.
* Origen: Incluye un campo de trazabilidad (origen: SEMANARIO | EXCEPCION | ...) para auditoría.

## 4. Stack Tecnológico y Estrategia de Infraestructura

### 4.1 Principios de Selección

La arquitectura prioriza el Bajo Costo Operativo (presupuesto non-profit) y la Eficiencia de Recursos. Se selecciona un stack "Serverless-First" delegando la complejidad de servidores a Google Cloud Platform (PaaS) y maximizando el uso del cómputo en el cliente (Edge).

### 4.2 Diagrama de Componentes (C4 Level 2)

* A. Frontend (Client-Side Rendering)
	- Tecnología: Next.js (React) en modo SPA/CSR.
	- Gestión de Estado y Caché: React Query (TanStack Query).
		+ Función Crítica: Mitigar la latencia y costos de lectura mediante una caché agresiva en el navegador. Los datos inmutables (historial de comensales) y semi-estáticos (configuración de semanarios) se leen una vez y se mantienen en memoria.
	- Patrón de Datos (View Models):
		+ Se utiliza el patrón de Hidratación en Cliente. La base de datos entrega entidades puras (Semanario, Actividad, Ausencia) y el cliente las procesa en tiempo real para generar objetos de vista (SemanarioDesnormalizado).
		+ *Justificación:* Evita la complejidad de mantener datos calculados sincronizados en la base de datos. Transfiere la carga computacional de la nube (costosa) al dispositivo del usuario (gratis).
* B. Backend & Persistencia (Firebase Ecosystem)
	- Base de Datos Operativa: Google Cloud Firestore (NoSQL).
		+ Modelo: Documentos optimizados para lectura.
		+ Optimización: Uso de "Fat Documents" para configuraciones semanales (guardar la semana entera en un JSON) para reducir las lecturas de 7 a 1 por consulta.
	- Lógica de Negocio: Cloud Functions (TypeScript).
		+ Responsables exclusivamente de operaciones de escritura críticas: Cierre de día (Snapshot), validaciones de seguridad y triggers asíncronos.
* C. Analítica y Reportes (BigQuery Strategy)
	- Componente: Firebase Extension "Stream Firestore to BigQuery".
	- Flujo: Replicación automática de la colección comensales (tickets cerrados) hacia una tabla data warehouse.
	- Propósito:
		1. Permitir consultas SQL complejas (agregaciones, sumas por centro de costo) imposibles de realizar eficientemente en NoSQL.
		2. Separar la carga de trabajo: Los reportes pesados de la administración no impactan el rendimiento de la app de los residentes.
		3. Alimentar dashboards de Business Intelligence (Looker Studio) de bajo costo.

### 4.3 Integraciones y Seguridad

* Autenticación: Firebase Auth (Email/Password).
* Integraciones Externas: Arquitectura dirigida por eventos (Webhooks). El sistema publica eventos de dominio (cierre_diario_completado) que pueden ser consumidos por middlewares (ej. n8n) para sincronizar con ERPs externos (ERPNext) sin acoplar el código base.

# 5. Resumen Ejecutivo (Blueprint)

El sistema "Comensales Residencia" se define como una plataforma de gestión logística orientada a la formación.
1. Filosofía: Prioriza la integridad de datos y la planificación sobre la flexibilidad inmediata. Aplica reglas de cierre estricto ("Snapshot") para garantizar que lo solicitado a cocina sea inmutable.
2. Datos: Utiliza un modelo híbrido.
	* Input: Datos vivos y volátiles (Semanarios, Excepciones) que expresan la intención del usuario.
	* Output: Datos congelados (Comensales) que expresan el hecho facturable, generados por un proceso de consolidación diario.
3. Tecnología:
	* Frontend: React con fuerte caché local para experiencia instantánea y bajo consumo de lecturas.
	* Backend: Serverless (Firebase) para escalabilidad automática y mantenimiento cero.
	* Analytics: BigQuery para resolver la complejidad contable sin ensuciar la base de datos operativa.
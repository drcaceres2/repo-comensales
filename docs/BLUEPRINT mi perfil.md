# BLUEPRINT DE ARQUITECTURA: Módulo "Mi Perfil"

**Proyecto:** comensales.app
**Dominio:** Identidad, Logística Base y Atributos de Tenant
**Estado:** Aprobado para Implementación

## 1. Visión General y Responsabilidades

El módulo "Mi Perfil" permite al residente autogestionar su información biográfica y académica, así como responder a campos dinámicos exigidos por su Residencia (Tenant). 

* **Frontera Estricta:** El usuario NO puede alterar su estado logístico (Habitación, Dieta, Número de Ropa) ni sus roles. Este módulo no es una puerta trasera administrativa.
* **Separación de Carga (Media vs Data):** La mutación de archivos binarios (Foto) se desacopla del flujo de datos JSON para optimizar la red y aislar responsabilidades de almacenamiento.

## 2. Contratos de Datos (DTOs)

Se implementa el patrón de **Hidratación en Servidor** para el DTO de Lectura. El backend se encarga de aplanar los datos logísticos para que el cliente reciba un objeto listo para renderizar, ocultando los IDs internos (Cruce de la Dieta).

DTO DE LECTURA (Enviado del Servidor al Cliente):
```TypeScript
    export const MiPerfilReadDTOSchema = z.object({
        nombre: z.string(),
        apellido: z.string(),
        nombreCorto: z.string().optional(),
        identificacion: z.string().optional(),
        telefonoMovil: z.string().optional(),
        fechaDeNacimiento: z.string().optional(),
        fotoPerfil: z.string().url().nullable().optional(),
        universidad: z.string().optional(),
        carrera: z.string().optional(),
        logistica: z.object({
            habitacion: z.string(),
            numeroDeRopa: z.string(),
            dieta: z.object({
                nombre: z.string(),
                descripcion: z.string().optional(),
            }),
        }),
        camposPersonalizados: z.record(z.string()),
        timestampActualizacion: z.string().datetime(),
    }).strict();
```

PAYLOAD DE ESCRITURA (Enviado del Cliente al Servidor)
Nota: Excluye explícitamente los nodos logísticos.
```TypeScript
    export const UpdateMiPerfilPayloadSchema = z.object({
        nombre: z.string().min(2).max(100).optional(),
        apellido: z.string().min(2).max(255).optional(),
        nombreCorto: z.string().min(2).max(15).optional(),
        identificacion: z.string().optional(),
        telefonoMovil: z.string().optional(),
        fechaDeNacimiento: z.string().datetime().nullable().optional(),
        universidad: z.string().optional(),
        carrera: z.string().optional(),
        fotoPerfil: z.string().url().nullable().optional(),
        camposPersonalizados: z.record(z.string()).optional(),
        lastUpdatedAt: z.string().datetime(),
    }).strict();
```

## 3. Lógica de Persistencia y Seguridad (Capa 2)

La Cloud Function `updateMiPerfil` ejecuta una validación asimétrica actuando como "Gatekeeper" contra inyecciones de datos no autorizadas:

1.  **Parseo Base:** Validar estructura estática de tipos con `UpdateMiPerfilPayloadSchema`.
2.  **Validación Dinámica (Tenant):**
    * Leer configuración del Tenant (`Residencia`).
    * Iterar sobre `payload.camposPersonalizados`.
    * Rechazar mutación si el campo no existe en el Singleton, si la bandera `modificablePorInteresado` es falsa, o si la entrada falla la prueba de `regex`.
3.  **Control de Concurrencia (OCC):**
    * Abortar si `doc.timestampActualizacion > payload.lastUpdatedAt`.
4.  **Mutación Atómica:**
    * Ejecutar actualización parcial mediante sintaxis de puntos en Firestore para blindar los roles y la logística.

## 4. Estrategia Multi-Tenant para Archivos (Storage)

Se aplica una regla de **Sobrescritura Determinista** para evitar la acumulación de archivos huérfanos y optimizar costos de almacenamiento.

* **Ruta de Almacenamiento:** `tenants/{residenciaId}/usuarios/{usuarioId}/perfil/avatar_current.jpg`
* **Manejo de Caché:** El cliente añade el timestamp como *query parameter* (`?t=123456789`) en la URL de la base de datos para forzar la recarga visual sin alterar el nombre en el bucket.
* **Storage Rules (Frontend Directo):**

    allow write: if request.auth.uid == usuarioId 
                 && request.resource.size < 5 * 1024 * 1024 
                 && request.resource.contentType.matches('image/.*');

## 5. Decisiones de UI/UX (Mobile-First)

La interfaz se estructura en bloques semánticos delimitados para mitigar la fatiga de *scroll*:

1.  **Cabecera de Identidad:** Foto, Nombres y Correo (solo lectura).
2.  **Información Personal (Editable):** Nombres, Fecha de Nacimiento, Contacto.
3.  **Perfil Académico (Editable):** Universidad, Carrera.
4.  **Logística (Solo Lectura):** UI con indicador de candado. Muestra Habitación, Ropa y Dieta hidratada.
5.  **Información Adicional (Dinámica):** Renderizado de `camposPersonalizados` basado en el Singleton. Se omite si el arreglo está vacío.
# SPEC-003 · UI/UX

**Proyecto:** Agente de Voz Bilingüe (Inglés/Español)  
**Documento:** SPEC-003 · **Versión:** 5.0 · **Fecha:** 28 de septiembre de 2026 · **Estado:** Borrador para revisión  
**Relacionados:** SPEC-002, SPEC-004

El diseño será estrictamente minimalista, reduciendo la carga cognitiva y centrando la atención en la conversación.

## 1. Pantallas

| Pantalla | Descripción |
|---|---|
| Login / Registro | Email y contraseña (Google OAuth fuera del MVP) |
| Sala de espera | Para usuarios `pending` o `rejected` (SPEC-004) |
| Principal (voz) | Interfaz de conversación con el sidebar a la izquierda |
| Detalle de sesión | Transcripción, reproductor de audio y resumen de una sesión anterior |
| Panel de administración | Solo para admins: solicitudes de acceso pendientes y resueltas |

## 2. Sidebar (Estilo Gemini)

- Barra lateral colapsable con el historial de sesiones ordenadas por fecha, agrupadas en Hoy, Últimos 7 días y Anteriores.
- Cada elemento muestra el título (generado a partir del resumen), el modo (Libre o Tutor) y la duración.
- Opciones por sesión: renombrar y eliminar (con confirmación, ya que borra también el audio).
- Botón "Nueva conversación" en la parte superior.
- En móvil, el sidebar se convierte en un panel superpuesto que se abre con un botón de menú.

## 3. Interfaz de Voz (Estilo Gemini Live)

- **Antes de iniciar:** selector de modo (Conversación libre / Tutor), botón grande de micrófono y un aviso breve de que la sesión se graba.
- **Durante la sesión:** animación fluida (ondas o gradientes pulsantes) que reacciona a la voz del usuario y a la del agente, con colores distintos para cada uno.
- **Temporizador** visible con cuenta regresiva desde 7:00; cambia de color en el último minuto.
- **Transcripción en vivo** bajo la animación, que puede ocultarse.
- **Controles:** silenciar micrófono y finalizar sesión.
- **Al terminar:** pantalla de "Guardando…" y luego la vista de detalle con el resumen.

## 4. Estados de la Interfaz de Voz

| Estado | Qué ve el usuario | Transición |
|---|---|---|
| Inactivo | Selector de modo y botón de micrófono | Pulsar micrófono → Conectando |
| Conectando | Indicador de carga breve | Conexión lista → En conversación; fallo → Error |
| En conversación | Animación reactiva, temporizador y transcripción | Silenciar → Silenciado; fin → Guardando |
| Silenciado | Animación atenuada e icono de micrófono tachado | Reactivar → En conversación |
| Guardando | Progreso de subida del audio y generación del resumen | Listo → Detalle de sesión |
| Error | Mensaje claro y acción sugerida | Reintentar → Inactivo |

## 5. Detalle de Sesión

- **Reproductor de audio** con barra de progreso y velocidad de reproducción (0,75x, 1x, 1,25x).
- **Transcripción** como chat, diferenciando usuario y agente.
- **Resumen** en tarjetas: temas hablados, correcciones (frase original → corregida, con explicación), vocabulario nuevo y consejos.
- Si el resumen falló, botón para generarlo de nuevo.

## 6. Sala de Espera y Panel de Administración

- **Sala de espera:** mensaje de que la solicitud está en revisión; se actualiza sola al ser aprobada. Si fue rechazada, muestra un mensaje informativo.
- **Panel de administración:** lista de solicitudes con email, fecha y botones Aprobar/Rechazar; insignia con el número de pendientes en el menú; notificación in-app al llegar una nueva solicitud.

## 7. Accesibilidad

- Todos los controles accesibles por teclado y con etiquetas ARIA.
- Contraste de color WCAG AA.
- Si el usuario tiene activado `prefers-reduced-motion`, la animación se reemplaza por un indicador estático.
- La transcripción en vivo sirve también como subtítulos.

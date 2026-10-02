# SPEC-001 · Arquitectura del Sistema

**Proyecto:** Agente de Voz Bilingüe (Inglés/Español)  
**Documento:** SPEC-001 · **Versión:** 5.0 · **Fecha:** 28 de septiembre de 2026 · **Estado:** Borrador para revisión  
**Relacionados:** SPEC-002, SPEC-005, SPEC-007

## 1. Visión General

Arquitectura Serverless en tres capas más un servicio de IA externo. La diferencia clave respecto a versiones anteriores es que el audio de la conversación **no pasa por el backend**: el navegador se conecta directamente a Gemini Live por WebSocket usando un token efímero que el backend genera tras verificar al usuario. El backend se encarga de la autorización, la persistencia y las tareas posteriores a la sesión.

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Frontend | Vue 3 + Vite + Pinia, alojado en Vercel | UI, captura y reproducción de audio en streaming, animación, grabación de la sesión, conexión WebSocket a Gemini |
| Backend | Node.js en Vercel Functions | Verificación de usuarios, emisión de tokens efímeros, límites de uso, guardado de transcripciones, URLs firmadas de audio, generación del resumen |
| Datos | Supabase: PostgreSQL, Auth, Realtime, Storage | Usuarios, sesiones, mensajes, resúmenes, notificaciones en vivo y archivos de audio |
| IA | Gemini API (Google AI Studio) | `gemini-3.8-live` para la conversación y un modelo de texto Gemini para el resumen |

## 2. Componentes del Frontend

- **Cliente Supabase** (`supabase-js`) con la clave pública, para autenticación y suscripciones Realtime.
- **Cliente Gemini Live** (SDK `@google/genai`) que abre el WebSocket usando el token efímero como credencial.
- **Captura de micrófono:** `getUserMedia` + `AudioWorklet` que convierte el audio a PCM de 16 bits, mono, 16 kHz, y lo envía en fragmentos de 20 a 40 ms.
- **Reproducción:** cola de fragmentos PCM de 24 kHz recibidos del modelo, reproducidos con Web Audio API; la cola se vacía de inmediato cuando el modelo indica una interrupción.
- **Visualización:** `AnalyserNode` sobre la entrada y la salida para la animación.
- **Grabación:** mezcla de micrófono y voz del agente en un `MediaStreamAudioDestinationNode`, grabada con `MediaRecorder`.
- **Stores Pinia:** usuario, sesión activa (estado, temporizador, transcripción) e historial.

## 3. Componentes del Backend

- **Middleware de autenticación:** verifica el JWT de Supabase y carga rol y estado desde `users_profile`.
- **Servicio de tokens:** crea el registro de sesión, valida límites y solicita a Gemini un token efímero con modelo y configuración bloqueados.
- **Servicio de sesiones:** guarda los turnos de la transcripción, emite URLs firmadas de subida y descarga de audio y cierra la sesión.
- **Servicio de resumen:** al cerrar una sesión, envía la transcripción a un modelo de texto Gemini y guarda el resultado estructurado.
- **Servicio de administración:** listado y resolución de solicitudes de acceso.

## 4. Flujo Completo de una Sesión

- **1. Inicio:** el usuario elige el modo y pulsa el micrófono. El frontend llama a `POST /api/voice/sessions`.
- **2. Autorización:** el backend verifica JWT, estado `approved`, que no haya otra sesión activa y el límite diario. Crea la fila en `chat_sessions` y pide a Gemini un token efímero.
- **3. Conexión:** el frontend abre el WebSocket con Gemini usando el token y empieza a enviar audio del micrófono y a grabar.
- **4. Conversación:** Gemini responde con audio en streaming y transcripciones del usuario y del modelo. Al terminar cada turno, el frontend envía los textos a `POST /api/chat/sessions/:id/messages`.
- **5. Cierre:** al llegar a 7 minutos o cuando el usuario finaliza, se cierra el WebSocket, se detiene la grabación y se sube el audio a Supabase Storage con una URL firmada.
- **6. Resumen:** el frontend llama a `POST /api/chat/sessions/:id/finish`; el backend marca la sesión como completada y genera el resumen.
- **7. Historial:** la sesión aparece en el sidebar con transcripción, audio y resumen.

## 5. Límites de Plataforma Relevantes

| Límite | Valor | Cómo se maneja |
|---|---|---|
| Conexión WebSocket de Gemini Live | Aprox. 10 minutos | Sesiones de máximo 7 minutos; no se necesita reconexión |
| Contexto de Gemini Live | 128k tokens (el audio consume ~25 tokens/s) | Una sesión de 7 min usa ~10.500 tokens de audio; sin riesgo |
| Cuerpo de petición en Vercel Functions | Aprox. 4,5 MB | El audio no pasa por Vercel: se sube directo a Supabase Storage |
| WebSockets en Vercel Functions | No soportados de forma persistente | El navegador se conecta directo a Gemini |
| Nivel gratuito de Gemini | Límites de uso reducidos | Solo para desarrollo; nivel de pago en producción (SPEC-007) |

Los nombres de los modelos se configuran por variables de entorno para poder cambiarlos sin tocar código, ya que los modelos Live se actualizan con frecuencia.

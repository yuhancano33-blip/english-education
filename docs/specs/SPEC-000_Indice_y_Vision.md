# SPEC-000 · Índice y Visión General

**Proyecto:** Agente de Voz Bilingüe (Inglés/Español)  
**Documento:** SPEC-000 · **Versión:** 5.5 · **Fecha:** 28 de septiembre de 2026 · **Estado:** Borrador para revisión  
**Relacionados:** todos los specs (SPEC-001 a SPEC-007)

> Este documento es el punto de entrada. Resume la visión del producto, las decisiones tomadas y el plan de implementación, y remite a cada spec para el detalle. Sustituye al documento único "Especificaciones Técnicas y Arquitectura Detallada" (v3 y v4).

## 1. Visión del Producto

Aplicación web privada en la que un grupo reducido de usuarios aprobados conversa por voz, en tiempo real, con un agente de IA que entiende y responde en inglés y en español. El agente puede funcionar como compañero de conversación libre o como tutor de inglés que corrige los errores importantes y, al terminar, entrega un resumen con correcciones y vocabulario.

La experiencia se inspira en Gemini Live: interfaz mínima, animación reactiva a la voz, posibilidad de interrumpir al agente e historial de conversaciones en una barra lateral, donde cada sesión puede volver a escucharse.

## 2. Índice de Specs

| Código | Documento | Contenido |
|---|---|---|
| SPEC-000 | Índice y Visión General | Visión, alcance, decisiones, plan por fases, glosario y cambios |
| SPEC-001 | Arquitectura del Sistema | Capas, componentes, flujo de datos y límites de plataforma |
| SPEC-002 | Motor de Voz con Gemini Live | Modelo, tokens efímeros, audio, sesión de 7 min, grabación, modo tutor y resumen |
| SPEC-003 | UI/UX | Sidebar, interfaz de voz, estados, reproductor, sala de espera y panel admin |
| SPEC-004 | Control de Acceso y Aprobaciones | Estados de usuario y flujo de aprobación por los 2 administradores |
| SPEC-005 | Modelo de Datos y API | Tablas, Storage y endpoints REST |
| SPEC-006 | Seguridad y Privacidad | Autenticación, claves, límites de uso, RLS, consentimiento y retención |
| SPEC-007 | Operación, Entornos y Flujo de Trabajo | Entornos, variables, facturación, monitoreo y Git |

## 3. Alcance

#### Dentro del alcance (MVP)

- Registro e inicio de sesión con Supabase Auth; acceso cerrado por defecto con aprobación manual por 2 administradores.
- Conversación por voz en tiempo real con Gemini 3.8 Live, con interrupciones (barge-in) y transcripción en vivo.
- Sesiones de máximo 7 minutos, con aviso previo y cierre automático.
- Grabación del audio completo de cada sesión para volver a escucharla.
- Dos modos de conversación: Conversación libre y Tutor de inglés.
- Resumen al finalizar cada sesión con errores corregidos y vocabulario nuevo.
- Historial de sesiones con transcripción, audio y resumen.

#### Fuera del alcance (MVP)

- Aplicaciones móviles nativas (la app es web responsive).
- Sesiones de más de 7 minutos o reconexión automática (session resumption).
- Entrada de video o cámara, aunque el modelo lo soporta.
- Analítica avanzada de progreso del estudiante a lo largo del tiempo.

## 4. Registro de Decisiones

Decisiones cerradas en esta versión. Sustituyen a lo indicado en v3 y v4.

| Tema | Decisión | Motivo |
|---|---|---|
| Proveedor de IA | Google Gemini, modelo `gemini-3.8-live` | Modelo nativo de voz a voz, baja latencia, buen soporte bilingüe; ya existe cuenta en Google AI Studio |
| Arquitectura de voz | Tiempo real: el navegador se conecta directo a Gemini por WebSocket con un token efímero | Las funciones de Vercel no pueden mantener WebSockets; el token evita exponer la API key |
| STT y TTS separados | Eliminados | Gemini Live recibe y devuelve audio y entrega las transcripciones |
| Fin de habla | Detección automática de Gemini (VAD) + botón de silenciar | Conversación natural con interrupciones |
| Duración de sesión | Máximo 7 minutos | Queda por debajo del límite de ~10 min por conexión y evita implementar reconexión |
| Audio | Se guarda la sesión completa en Supabase Storage | Permite volver a escuchar las conversaciones |
| Rol pedagógico | Dos modos (Libre / Tutor) + resumen al final | Aporta valor educativo con bajo costo de implementación |
| Facturación Gemini | Nivel gratuito en desarrollo; nivel de pago antes de tener usuarios reales | Límites y condiciones de uso de datos del nivel gratuito |
| Lenguaje | TypeScript por defecto; JavaScript cuando sea necesario | Tipado en API y stores sin forzarlo en piezas donde estorba (AudioWorklet, configuración) |
| Método de autenticación | Solo email y contraseña; Google OAuth fuera del MVP | Menos configuración y superficie mientras el grupo de usuarios es reducido |
| Email a los administradores | Resend, llamado desde un endpoint del backend que invoca un trigger de la base de datos | Realtime solo avisa con la app abierta; Resend tiene API simple y nivel gratuito |
| Reintento de usuarios rechazados | Bloqueado por ahora: un usuario rechazado no puede volver a solicitar acceso | Se reevaluará más adelante; un admin puede resolverlo manualmente |
| Flujo de ramas | Una rama por spec; el responsable del proyecto abre el PR al terminar el spec | Control de revisión por spec completo |
| Límite de sesiones por usuario al día | 10 sesiones (`DAILY_SESSION_LIMIT`); el día se cuenta en hora de Colombia (`America/Bogota`) y se renueva a medianoche | Usuarios en Colombia; un reinicio a hora fija es fácil de comunicar |
| Modo por defecto al iniciar | Tutor | Propuesta aceptada |
| Voz del agente | Configurable con `GEMINI_VOICE`; vacía usa la voz por defecto de Gemini | Se puede elegir más adelante sin tocar código |
| Instrucciones por modo | Fase 2: instrucciones base comunes a ambos modos; las específicas de Libre y Tutor llegan en la Fase 4 | Respetar el plan por fases |
| Sesiones abandonadas | Al pedir una nueva sesión, las activas de más de 10 min se marcan `interrupted` en la misma transacción | Cumple SPEC-006 §3 sin necesidad de un cron |
| Texto de consentimiento de grabación | El definido en SPEC-006 §7 | Aprobado antes de la Fase 3 |
| Registro del consentimiento | Columna `users_profile.recording_consent_at` y endpoint `POST /api/me/consent`; sin consentimiento no se emite token de voz | Queda constancia de cuándo aceptó y el backend lo exige |
| Título provisional de sesión | Hasta la Fase 4 se muestra modo y fecha (p. ej. "Tutor · 12 nov, 15:30"); el usuario puede renombrar | El título generado desde el resumen llega con el resumen |
| Idioma del resumen | Explicaciones, temas y consejos en español; frases corregidas, términos y ejemplos en inglés | El usuario es hispanohablante aprendiendo inglés |
| Título generado | La misma llamada del resumen devuelve un `title` corto (máx. 6 palabras); solo se aplica si el usuario no renombró la sesión | Evita una segunda llamada al modelo |
| Resumen de sesiones interrumpidas | También se genera si hubo conversación (al menos un turno del usuario) | Una sesión cortada sigue teniendo valor pedagógico |
| Tiempo de retención de audios | 90 días (`AUDIO_RETENTION_DAYS`), o hasta que el usuario borre la sesión. Un Vercel Cron diario borra el audio; transcripción y resumen se conservan | Confirmado en la Fase 5 |
| Límite de peticiones HTTP | 60 por minuto por usuario (`RATE_LIMIT_PER_MINUTE`), con contador en una tabla de Supabase en lugar de Upstash | Sin servicios ni claves adicionales; suficiente para un grupo reducido |
| Eliminar la cuenta | `DELETE /api/me` y botón "Eliminar mi cuenta" con confirmación; borra audios, sesiones, turnos, perfil y usuario de Auth. Los administradores no pueden borrarse desde la app | SPEC-006 §7 lo exige; evita quedarse sin administradores |

## 5. Decisiones Pendientes

| Decisión | Propuesta por defecto |
|---|---|
| Voz del agente (valor concreto) | Elegir una voz de Gemini que suene natural en ambos idiomas, probándolas en AI Studio, y ponerla en `GEMINI_VOICE` |

## 6. Plan de Implementación por Fases

| Fase | Objetivo | Entregables |
|---|---|---|
| 1 | Base y acceso | Proyecto Vue + Vercel, Supabase Auth, tablas y RLS, sala de espera, panel de aprobación (SPEC-004) |
| 2 | Voz en tiempo real | Endpoint de token efímero, conexión a Gemini Live, audio de entrada/salida, animación y límite de 7 min (SPEC-002) |
| 3 | Historial y grabación | Guardado de transcripciones, grabación y subida del audio, sidebar con reproductor (SPEC-003, SPEC-005) |
| 4 | Modo tutor y resumen | Instrucciones por modo, generación y visualización del resumen |
| 5 | Producción | Nivel de pago en Gemini, tope de gasto, límites de uso, monitoreo y revisión de seguridad (SPEC-006, SPEC-007) |

## 7. Glosario

| Término | Definición |
|---|---|
| Gemini Live API | API de Google para conversaciones de voz bidireccionales en tiempo real por WebSocket |
| Token efímero | Credencial de corta duración y uso limitado que el backend genera para que el navegador se conecte a Gemini sin conocer la API key |
| Barge-in | Capacidad del usuario de interrumpir al agente mientras habla |
| VAD | Voice Activity Detection: detección automática de cuándo el usuario empieza y termina de hablar |
| RLS | Row Level Security: reglas de PostgreSQL que limitan qué filas puede ver o modificar cada usuario |
| Sesión | Una conversación de voz de máximo 7 minutos, con su transcripción, audio y resumen |

## 8. Historial de Cambios

| Versión | Cambios |
|---|---|
| v3 | Documento único inicial. |
| v4 | Ampliación del documento único: alcance, flujos, modelo de datos, API, seguridad y decisiones pendientes. |
| v5 | División en 8 specs. Se adopta Gemini 3.8 Live en tiempo real con tokens efímeros, sesiones de 7 minutos, grabación del audio, modos Libre/Tutor con resumen y plan por fases. Se eliminan los proveedores separados de STT/TTS y el endpoint de procesamiento de audio en el backend. |
| v5.1 | Specs movidos a `docs/specs/`. Decisiones: TypeScript con JavaScript cuando sea necesario, solo email y contraseña, email a admins con Resend, reintento de rechazados bloqueado, una rama por spec con PR abierto por el responsable. Sin Docker: el entorno local usa el proyecto de Supabase de desarrollo en la nube. |
| v5.2 | Fase 2: límite diario de 10 sesiones con día en hora de Colombia, Tutor por defecto, voz configurable, instrucciones base comunes en Fase 2, cierre de sesiones abandonadas al crear una nueva, `POST /api/voice/sessions` devuelve también `model`, y `finish` mínimo en Fase 2. |
| v5.3 | Fase 3: texto y registro del consentimiento de grabación (`recording_consent_at`, `POST /api/me/consent`), título provisional por modo y fecha, borrado automático por retención aplazado a la Fase 5, un único `AudioContext` para captura, reproducción y grabación. |
| v5.4 | Fase 4: instrucciones específicas por modo, resumen en español con frases y vocabulario en inglés, `title` generado en la misma llamada, resumen también para sesiones interrumpidas con conversación. |
| v5.5 | Fase 5: retención de audios de 90 días con Vercel Cron, límite de 60 peticiones/min por usuario con contador en Supabase (sustituye a Upstash), restricción de origen con `ALLOWED_ORIGINS`, logs estructurados por petición y eliminación de cuenta (`DELETE /api/me`). |

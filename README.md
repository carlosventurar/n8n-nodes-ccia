# n8n-nodes-ccia

Este es un nodo comunitario de n8n para integrar con **CCIA (Contact Center IA)**.

[CCIA](https://ccia.io) es una plataforma de contact center impulsada por inteligencia artificial que permite gestionar conversaciones, contactos y agentes de manera eficiente.

[n8n](https://n8n.io/) es una plataforma de automatizacion de workflows con licencia [fair-code](http://faircode.io).

## Instalacion

Siga la [guia de instalacion](https://docs.n8n.io/integrations/community-nodes/installation/) en la documentacion de nodos comunitarios de n8n.

### Instalacion via npm

```bash
npm install n8n-nodes-ccia
```

### Instalacion manual

1. Clone este repositorio
2. Ejecute `npm install` para instalar dependencias
3. Ejecute `npm run build` para compilar
4. Copie el directorio `dist` a su directorio de nodos personalizados de n8n

## Operaciones Soportadas

### Nodo CCIA (Actions)

#### Conversaciones
- **Create**: Crear una nueva conversacion
- **Get**: Obtener una conversacion por ID
- **Get Many**: Obtener multiples conversaciones con filtros
- **Update**: Actualizar estado de una conversacion
- **Assign**: Asignar conversacion a un agente o equipo

#### Mensajes
- **Send**: Enviar mensaje a una conversacion (outgoing o nota privada)
- **Get Many**: Obtener mensajes de una conversacion

#### Contactos
- **Create**: Crear un nuevo contacto
- **Get**: Obtener un contacto por ID
- **Search**: Buscar contactos por nombre, email o telefono
- **Update**: Actualizar informacion de un contacto

#### Agentes
- **Get Many**: Obtener lista de agentes

### Nodo CCIA Trigger (Webhooks)

Escucha eventos en tiempo real de CCIA:

- `conversation.created` - Nueva conversacion creada
- `conversation.assigned` - Conversacion asignada a agente/equipo
- `conversation.resolved` - Conversacion resuelta
- `conversation.reopened` - Conversacion reabierta
- `message.received` - Mensaje entrante recibido
- `message.sent` - Mensaje enviado
- `contact.created` - Nuevo contacto creado
- `contact.updated` - Contacto actualizado
- `csat.received` - Encuesta CSAT recibida
- `sla.breached` - SLA incumplido
- `agent.status_changed` - Agente cambio su estado
- `bot.handoff` - Bot transfirio a humano

## Credenciales

### API Key
1. Acceda a su instancia de CCIA
2. Vaya a **Configuracion > API**
3. Copie su **API Access Token**
4. En n8n, cree una credencial de tipo "CCIA API"
5. Ingrese la URL de su instancia y el token

### OAuth2 (Opcional)
Para integraciones que requieren OAuth2, configure:
1. Client ID
2. Client Secret
3. URL de la instancia

## Seguridad

### Validacion de Webhooks

El nodo trigger soporta validacion HMAC-SHA256 para verificar la autenticidad de los webhooks:

1. Configure un **Webhook Secret** en las credenciales
2. Habilite "Validate Signature" en las opciones del trigger
3. Los webhooks con firma invalida seran rechazados

### Proteccion contra Replay Attacks

Configure el parametro "Max Timestamp Age" para rechazar webhooks antiguos (default: 5 minutos).

## Compatibilidad

- n8n version: >= 1.0.0
- Node.js: >= 18.x

## Recursos

* [Documentacion de n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)
* [Documentacion de CCIA API](https://docs.ccia.io/api)

## Licencia

[MIT](LICENSE.md)

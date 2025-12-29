import {
	IHookFunctions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	IDataObject,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	NodeOperationError,
} from 'n8n-workflow';

import {
	cciaApiRequest,
	validateWebhookSignature,
	validateWebhookTimestamp,
	validateNonce,
	parseWebhookPayload,
	WebhookEvent,
	ChannelType,
	getInboxes,
	getTeams,
	getAgents,
} from './GenericFunctions';

export class CCIATrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CCIA Trigger',
		name: 'cciaTrigger',
		icon: 'file:ccia.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].length > 1 ? $parameter["events"].length + " eventos" : $parameter["events"][0]}}',
		description: 'Escucha eventos de CCIA via webhooks',
		defaults: {
			name: 'CCIA Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'cciaApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			// ============== EVENTS SELECTION ==============
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['message.received'],
				options: [
					{
						name: 'Conversation Created',
						value: WebhookEvent.CONVERSATION_CREATED,
						description: 'Se dispara cuando se crea una nueva conversacion',
					},
					{
						name: 'Conversation Assigned',
						value: WebhookEvent.CONVERSATION_ASSIGNED,
						description: 'Se dispara cuando una conversacion es asignada a un agente o equipo',
					},
					{
						name: 'Conversation Resolved',
						value: WebhookEvent.CONVERSATION_RESOLVED,
						description: 'Se dispara cuando una conversacion es resuelta/cerrada',
					},
					{
						name: 'Conversation Reopened',
						value: WebhookEvent.CONVERSATION_REOPENED,
						description: 'Se dispara cuando una conversacion es reabierta',
					},
					{
						name: 'Message Received',
						value: WebhookEvent.MESSAGE_RECEIVED,
						description: 'Se dispara cuando se recibe un mensaje entrante del cliente',
					},
					{
						name: 'Message Sent',
						value: WebhookEvent.MESSAGE_SENT,
						description: 'Se dispara cuando se envia un mensaje al cliente',
					},
					{
						name: 'Contact Created',
						value: WebhookEvent.CONTACT_CREATED,
						description: 'Se dispara cuando se crea un nuevo contacto',
					},
					{
						name: 'Contact Updated',
						value: WebhookEvent.CONTACT_UPDATED,
						description: 'Se dispara cuando se actualiza informacion de un contacto',
					},
					{
						name: 'CSAT Received',
						value: WebhookEvent.CSAT_RECEIVED,
						description: 'Se dispara cuando se recibe una respuesta de encuesta CSAT',
					},
					{
						name: 'SLA Breached',
						value: WebhookEvent.SLA_BREACHED,
						description: 'Se dispara cuando se incumple un SLA (tiempo de respuesta/resolucion)',
					},
					{
						name: 'Agent Status Changed',
						value: WebhookEvent.AGENT_STATUS_CHANGED,
						description: 'Se dispara cuando un agente cambia su estado de disponibilidad',
					},
					{
						name: 'Bot Handoff',
						value: WebhookEvent.BOT_HANDOFF,
						description: 'Se dispara cuando el bot transfiere la conversacion a un agente humano',
					},
				],
				description: 'Eventos que disparan el workflow. Puede seleccionar multiples eventos.',
			},

			// ============== FILTERS ==============
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				description: 'Filtros para restringir los eventos procesados',
				options: [
					{
						displayName: 'Inbox',
						name: 'inboxId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getInboxes',
						},
						default: '',
						description: 'Solo procesar eventos de este inbox',
					},
					{
						displayName: 'Team',
						name: 'teamId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getTeams',
						},
						default: '',
						description: 'Solo procesar eventos de este equipo',
					},
					{
						displayName: 'Agent',
						name: 'agentId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getAgents',
						},
						default: '',
						description: 'Solo procesar eventos relacionados con este agente',
					},
					{
						displayName: 'Channel Type',
						name: 'channelType',
						type: 'options',
						options: [
							{ name: 'All Channels', value: '' },
							{ name: 'Web Widget', value: ChannelType.WEB_WIDGET },
							{ name: 'WhatsApp', value: ChannelType.WHATSAPP },
							{ name: 'Facebook', value: ChannelType.FACEBOOK },
							{ name: 'Twitter', value: ChannelType.TWITTER },
							{ name: 'Email', value: ChannelType.EMAIL },
							{ name: 'SMS', value: ChannelType.SMS },
							{ name: 'Telegram', value: ChannelType.TELEGRAM },
							{ name: 'LINE', value: ChannelType.LINE },
							{ name: 'API', value: ChannelType.API },
						],
						default: '',
						description: 'Solo procesar eventos de este canal',
					},
					{
						displayName: 'Conversation Status',
						name: 'conversationStatus',
						type: 'options',
						options: [
							{ name: 'Any Status', value: '' },
							{ name: 'Open', value: 'open' },
							{ name: 'Pending', value: 'pending' },
							{ name: 'Resolved', value: 'resolved' },
							{ name: 'Snoozed', value: 'snoozed' },
						],
						default: '',
						description: 'Solo procesar eventos de conversaciones con este estado',
					},
					{
						displayName: 'Message Type',
						name: 'messageType',
						type: 'options',
						options: [
							{ name: 'All Messages', value: '' },
							{ name: 'Incoming Only', value: 'incoming' },
							{ name: 'Outgoing Only', value: 'outgoing' },
							{ name: 'Private Notes Only', value: 'private' },
						],
						default: '',
						description: 'Solo para eventos de mensaje: filtrar por tipo',
					},
					{
						displayName: 'Exclude Bot Messages',
						name: 'excludeBotMessages',
						type: 'boolean',
						default: false,
						description: 'Whether to exclude messages sent by bots',
					},
					{
						displayName: 'Exclude Private Notes',
						name: 'excludePrivateNotes',
						type: 'boolean',
						default: false,
						description: 'Whether to exclude private notes (internal messages)',
					},
				],
			},

			// ============== SECURITY OPTIONS ==============
			{
				displayName: 'Security Options',
				name: 'securityOptions',
				type: 'collection',
				placeholder: 'Add Security Option',
				default: {},
				description: 'Opciones de seguridad para validacion de webhooks',
				options: [
					{
						displayName: 'Validate Signature',
						name: 'validateSignature',
						type: 'boolean',
						default: true,
						description: 'Whether to validate the webhook signature (HMAC-SHA256). Requiere configurar Webhook Secret en credenciales.',
					},
					{
						displayName: 'Validate Timestamp',
						name: 'validateTimestamp',
						type: 'boolean',
						default: true,
						description: 'Whether to validate the webhook timestamp to prevent replay attacks',
					},
					{
						displayName: 'Max Timestamp Age (seconds)',
						name: 'maxTimestampAge',
						type: 'number',
						default: 300,
						description: 'Maximo tiempo en segundos para aceptar webhooks (5 minutos por defecto)',
					},
					{
						displayName: 'Validate Nonce',
						name: 'validateNonce',
						type: 'boolean',
						default: true,
						description: 'Whether to track and validate nonces to prevent duplicate webhook processing',
					},
				],
			},

			// ============== OUTPUT OPTIONS ==============
			{
				displayName: 'Output Options',
				name: 'outputOptions',
				type: 'collection',
				placeholder: 'Add Output Option',
				default: {},
				description: 'Opciones para el formato de salida',
				options: [
					{
						displayName: 'Include Raw Payload',
						name: 'includeRawPayload',
						type: 'boolean',
						default: false,
						description: 'Whether to include the original raw webhook payload in addition to the normalized data',
					},
					{
						displayName: 'Flatten Output',
						name: 'flattenOutput',
						type: 'boolean',
						default: false,
						description: 'Whether to flatten nested objects in the output for easier access',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getInboxes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const inboxes = await getInboxes.call(this);
				return [
					{ name: 'All Inboxes', value: '' },
					...inboxes.map((inbox) => ({
						name: inbox.name,
						value: inbox.value,
					})),
				];
			},

			async getTeams(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const teams = await getTeams.call(this);
				return [
					{ name: 'All Teams', value: '' },
					...teams.map((team) => ({
						name: team.name,
						value: team.value,
					})),
				];
			},

			async getAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const agents = await getAgents.call(this);
				return [
					{ name: 'All Agents', value: '' },
					...agents.map((agent) => ({
						name: agent.name,
						value: agent.value,
					})),
				];
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const webhookData = this.getWorkflowStaticData('node');
				const events = this.getNodeParameter('events') as string[];

				if (webhookData.webhookId) {
					try {
						const response = await cciaApiRequest.call(
							this,
							'GET',
							`/webhooks/${webhookData.webhookId}`,
						);
						const webhook = response as IDataObject;
						const registeredEvents = webhook.subscriptions as string[] || [];

						// Verificar que el webhook tiene la URL correcta y todos los eventos
						if (webhook.url === webhookUrl) {
							const hasAllEvents = events.every((event) => registeredEvents.includes(event));
							if (hasAllEvents) {
								return true;
							}
						}
					} catch {
						// Webhook no existe o error, lo recrearemos
					}
				}
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events') as string[];
				const credentials = await this.getCredentials('cciaApi');

				const body: IDataObject = {
					url: webhookUrl,
					subscriptions: events,
				};

				// Agregar secreto para HMAC si esta configurado
				if (credentials.webhookSecret) {
					body.secret = credentials.webhookSecret;
				}

				try {
					const response = await cciaApiRequest.call(this, 'POST', '/webhooks', body);
					const webhookData = this.getWorkflowStaticData('node');
					webhookData.webhookId = (response as IDataObject).id;
					webhookData.registeredEvents = events;
					return true;
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`No se pudo crear el webhook: ${error.message}`,
					);
				}
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');

				if (webhookData.webhookId) {
					try {
						await cciaApiRequest.call(
							this,
							'DELETE',
							`/webhooks/${webhookData.webhookId}`,
						);
					} catch (error) {
						// Ignorar error 404 si el webhook ya fue eliminado
						const errorObj = error as { statusCode?: number };
						if (errorObj.statusCode !== 404) {
							throw error;
						}
					}
					delete webhookData.webhookId;
					delete webhookData.registeredEvents;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const body = this.getBodyData() as IDataObject;
		const events = this.getNodeParameter('events') as string[];
		const filters = this.getNodeParameter('filters', {}) as IDataObject;
		const securityOptions = this.getNodeParameter('securityOptions', {}) as IDataObject;
		const outputOptions = this.getNodeParameter('outputOptions', {}) as IDataObject;

		// Obtener el evento del payload
		const webhookEvent = (body.event || body.event_type) as string;

		// Verificar que el evento esta en la lista de eventos suscritos
		if (!events.includes(webhookEvent)) {
			return { noWebhookResponse: true };
		}

		// ============== SECURITY VALIDATIONS ==============

		// 1. Validar firma HMAC
		if (securityOptions.validateSignature !== false) {
			const credentials = await this.getCredentials('cciaApi');
			const signature = (req.headers['x-ccia-signature'] ||
				req.headers['x-chatwoot-signature'] ||
				req.headers['x-hub-signature-256']) as string;
			const webhookSecret = credentials.webhookSecret as string;

			if (webhookSecret && signature) {
				const rawBody = JSON.stringify(body);
				const isValid = validateWebhookSignature(rawBody, signature.replace('sha256=', ''), webhookSecret);

				if (!isValid) {
					return {
						webhookResponse: {
							status: 401,
							body: { error: 'Invalid signature' },
						},
					};
				}
			}
		}

		// 2. Validar timestamp
		if (securityOptions.validateTimestamp !== false) {
			const maxAge = (securityOptions.maxTimestampAge as number) || 300;
			const timestamp = body.timestamp || body.created_at || body.event_timestamp;

			if (timestamp && !validateWebhookTimestamp(timestamp as string, maxAge)) {
				return {
					webhookResponse: {
						status: 400,
						body: { error: 'Webhook timestamp too old' },
					},
				};
			}
		}

		// 3. Validar nonce (proteccion replay)
		if (securityOptions.validateNonce !== false) {
			const nonce = (body.event_id || body.id || req.headers['x-request-id']) as string;
			if (nonce && !validateNonce(nonce)) {
				return {
					webhookResponse: {
						status: 409,
						body: { error: 'Duplicate webhook (nonce already processed)' },
					},
				};
			}
		}

		// ============== APPLY FILTERS ==============

		// Extraer datos relevantes del payload para filtrado
		const conversation = body.conversation as IDataObject || {};
		const message = body.message as IDataObject || {};
		const inbox = body.inbox as IDataObject || {};
		const agent = body.agent as IDataObject || body.assignee as IDataObject || {};
		const sender = body.sender as IDataObject || message.sender as IDataObject || {};

		// Filter: Inbox
		if (filters.inboxId) {
			const payloadInboxId = inbox.id || conversation.inbox_id;
			if (payloadInboxId && payloadInboxId !== filters.inboxId) {
				return { noWebhookResponse: true };
			}
		}

		// Filter: Team
		if (filters.teamId) {
			const payloadTeamId = conversation.team_id || body.team_id;
			if (payloadTeamId && payloadTeamId !== filters.teamId) {
				return { noWebhookResponse: true };
			}
		}

		// Filter: Agent
		if (filters.agentId) {
			const payloadAgentId = agent.id || conversation.assignee_id;
			if (payloadAgentId && payloadAgentId !== filters.agentId) {
				return { noWebhookResponse: true };
			}
		}

		// Filter: Channel Type
		if (filters.channelType) {
			const payloadChannelType = inbox.channel_type || conversation.channel;
			if (payloadChannelType && payloadChannelType !== filters.channelType) {
				return { noWebhookResponse: true };
			}
		}

		// Filter: Conversation Status
		if (filters.conversationStatus) {
			const payloadStatus = conversation.status;
			if (payloadStatus && payloadStatus !== filters.conversationStatus) {
				return { noWebhookResponse: true };
			}
		}

		// Filter: Message Type (solo para eventos de mensaje)
		if (filters.messageType && (webhookEvent === WebhookEvent.MESSAGE_RECEIVED || webhookEvent === WebhookEvent.MESSAGE_SENT)) {
			const messageType = message.message_type;
			const isPrivate = message.private;

			if (filters.messageType === 'incoming' && messageType !== 'incoming') {
				return { noWebhookResponse: true };
			}
			if (filters.messageType === 'outgoing' && messageType !== 'outgoing') {
				return { noWebhookResponse: true };
			}
			if (filters.messageType === 'private' && !isPrivate) {
				return { noWebhookResponse: true };
			}
		}

		// Filter: Exclude Bot Messages
		if (filters.excludeBotMessages) {
			const senderType = sender.type || message.sender_type;
			if (senderType === 'agent_bot' || senderType === 'bot') {
				return { noWebhookResponse: true };
			}
		}

		// Filter: Exclude Private Notes
		if (filters.excludePrivateNotes && message.private) {
			return { noWebhookResponse: true };
		}

		// ============== PARSE AND NORMALIZE OUTPUT ==============

		const normalizedPayload = parseWebhookPayload(webhookEvent, body);

		// Preparar output final
		let outputData: IDataObject = normalizedPayload as unknown as IDataObject;

		// Opcion: Incluir raw payload
		if (outputOptions.includeRawPayload) {
			outputData = {
				...outputData,
				raw: body,
			};
		}

		// Opcion: Flatten output
		if (outputOptions.flattenOutput) {
			outputData = flattenObject(outputData);
		}

		return {
			workflowData: [this.helpers.returnJsonArray([outputData])],
		};
	}
}

/**
 * Aplana un objeto anidado en un solo nivel
 */
function flattenObject(obj: IDataObject, prefix = ''): IDataObject {
	const result: IDataObject = {};

	for (const [key, value] of Object.entries(obj)) {
		const newKey = prefix ? `${prefix}_${key}` : key;

		if (value && typeof value === 'object' && !Array.isArray(value)) {
			Object.assign(result, flattenObject(value as IDataObject, newKey));
		} else {
			result[newKey] = value;
		}
	}

	return result;
}

import {
	IHookFunctions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	IDataObject,
	NodeOperationError,
} from 'n8n-workflow';

import {
	cciaApiRequest,
	validateWebhookSignature,
	validateWebhookTimestamp,
	normalizeOutput,
} from './GenericFunctions';

export class CCIATrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CCIA Trigger',
		name: 'cciaTrigger',
		icon: 'file:ccia.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
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
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				default: 'message.received',
				options: [
					{
						name: 'Conversation Created',
						value: 'conversation.created',
						description: 'Se dispara cuando se crea una nueva conversacion',
					},
					{
						name: 'Conversation Assigned',
						value: 'conversation.assigned',
						description: 'Se dispara cuando una conversacion es asignada',
					},
					{
						name: 'Conversation Resolved',
						value: 'conversation.resolved',
						description: 'Se dispara cuando una conversacion es resuelta',
					},
					{
						name: 'Conversation Reopened',
						value: 'conversation.reopened',
						description: 'Se dispara cuando una conversacion es reabierta',
					},
					{
						name: 'Message Received',
						value: 'message.received',
						description: 'Se dispara cuando se recibe un mensaje entrante',
					},
					{
						name: 'Message Sent',
						value: 'message.sent',
						description: 'Se dispara cuando se envia un mensaje',
					},
					{
						name: 'Contact Created',
						value: 'contact.created',
						description: 'Se dispara cuando se crea un nuevo contacto',
					},
					{
						name: 'Contact Updated',
						value: 'contact.updated',
						description: 'Se dispara cuando se actualiza un contacto',
					},
					{
						name: 'CSAT Received',
						value: 'csat.received',
						description: 'Se dispara cuando se recibe una encuesta CSAT',
					},
					{
						name: 'SLA Breached',
						value: 'sla.breached',
						description: 'Se dispara cuando se incumple un SLA',
					},
					{
						name: 'Agent Status Changed',
						value: 'agent.status_changed',
						description: 'Se dispara cuando un agente cambia su estado',
					},
					{
						name: 'Bot Handoff',
						value: 'bot.handoff',
						description: 'Se dispara cuando el bot transfiere a un humano',
					},
				],
				description: 'Evento que dispara el workflow',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Filter by Inbox ID',
						name: 'inboxId',
						type: 'number',
						default: 0,
						description: 'Solo procesar eventos de este inbox (0 = todos)',
					},
					{
						displayName: 'Filter by Team ID',
						name: 'teamId',
						type: 'number',
						default: 0,
						description: 'Solo procesar eventos de este equipo (0 = todos)',
					},
					{
						displayName: 'Validate Signature',
						name: 'validateSignature',
						type: 'boolean',
						default: true,
						description: 'Whether to validate the webhook signature (HMAC-SHA256)',
					},
					{
						displayName: 'Max Timestamp Age (seconds)',
						name: 'maxTimestampAge',
						type: 'number',
						default: 300,
						description: 'Maximo tiempo en segundos para aceptar webhooks (proteccion replay)',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const webhookData = this.getWorkflowStaticData('node');
				const event = this.getNodeParameter('event') as string;

				// Si ya tenemos un webhook registrado, verificamos que sigue existiendo
				if (webhookData.webhookId) {
					try {
						const response = await cciaApiRequest.call(
							this,
							'GET',
							`/webhooks/${webhookData.webhookId}`,
						);
						// Verificar que el webhook tiene la URL y eventos correctos
						const webhook = response as IDataObject;
						if (webhook.url === webhookUrl && (webhook.subscriptions as string[])?.includes(event)) {
							return true;
						}
					} catch {
						// Webhook no existe, lo crearemos
					}
				}
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const event = this.getNodeParameter('event') as string;
				const credentials = await this.getCredentials('cciaApi');

				const body: IDataObject = {
					url: webhookUrl,
					subscriptions: [event],
				};

				// Agregar secreto para HMAC si esta configurado
				if (credentials.webhookSecret) {
					body.secret = credentials.webhookSecret;
				}

				try {
					const response = await cciaApiRequest.call(this, 'POST', '/webhooks', body);
					const webhookData = this.getWorkflowStaticData('node');
					webhookData.webhookId = (response as IDataObject).id;
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
						if (error.statusCode !== 404) {
							throw error;
						}
					}
					delete webhookData.webhookId;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const body = this.getBodyData() as IDataObject;
		const event = this.getNodeParameter('event') as string;
		const options = this.getNodeParameter('options', {}) as IDataObject;

		// Obtener el evento del payload
		const webhookEvent = body.event as string;

		// Verificar que el evento coincide
		if (webhookEvent !== event) {
			// No es el evento que esperamos, ignorar
			return {
				noWebhookResponse: true,
			};
		}

		// Validar firma HMAC si esta habilitado
		if (options.validateSignature !== false) {
			const credentials = await this.getCredentials('cciaApi');
			const signature = req.headers['x-ccia-signature'] as string;
			const webhookSecret = credentials.webhookSecret as string;

			if (webhookSecret) {
				const rawBody = JSON.stringify(body);
				const isValid = validateWebhookSignature(rawBody, signature, webhookSecret);

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

		// Validar timestamp para proteccion contra replay attacks
		const maxAge = (options.maxTimestampAge as number) || 300;
		const timestamp = body.timestamp || body.created_at;
		if (timestamp && !validateWebhookTimestamp(timestamp as string, maxAge)) {
			return {
				webhookResponse: {
					status: 400,
					body: { error: 'Webhook timestamp too old' },
				},
			};
		}

		// Aplicar filtros opcionales
		const inboxId = options.inboxId as number;
		const teamId = options.teamId as number;

		if (inboxId && inboxId > 0) {
			const payloadInboxId =
				(body.inbox?.id as number) ||
				(body.conversation?.inbox_id as number) ||
				(body.data?.inbox_id as number);
			if (payloadInboxId !== inboxId) {
				return { noWebhookResponse: true };
			}
		}

		if (teamId && teamId > 0) {
			const payloadTeamId =
				(body.team?.id as number) ||
				(body.conversation?.team_id as number) ||
				(body.data?.team_id as number);
			if (payloadTeamId !== teamId) {
				return { noWebhookResponse: true };
			}
		}

		// Normalizar output
		const normalizedData = normalizeOutput(
			webhookEvent,
			body.data as IDataObject || body,
			{
				conversation_id: body.conversation?.id || body.data?.conversation_id,
				contact_id: body.contact?.id || body.data?.contact_id,
				agent_id: body.agent?.id || body.data?.agent_id,
				inbox_id: body.inbox?.id || body.conversation?.inbox_id,
			},
		);

		return {
			workflowData: [this.helpers.returnJsonArray([normalizedData])],
		};
	}
}

import {
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	IDataObject,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';
import * as crypto from 'crypto';

// Tipos de CCIA
export interface ICCIAConversation {
	id: number;
	account_id: number;
	inbox_id: number;
	status: string;
	assignee_id?: number;
	team_id?: number;
	priority?: string;
	sla_policy_id?: number;
	custom_attributes?: IDataObject;
	created_at: string;
	updated_at: string;
}

export interface ICCIAMessage {
	id: number;
	conversation_id: number;
	content: string;
	content_type: string;
	message_type: string;
	sender_type: string;
	sender_id: number;
	private: boolean;
	created_at: string;
}

export interface ICCIAContact {
	id: number;
	name: string;
	email?: string;
	phone_number?: string;
	identifier?: string;
	custom_attributes?: IDataObject;
	created_at: string;
	updated_at: string;
}

export interface ICCIAAgent {
	id: number;
	name: string;
	email: string;
	role: string;
	availability_status: string;
}

// Constantes de rate limiting
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Realiza una solicitud a la API de CCIA con manejo de errores y rate limiting
 */
export async function cciaApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions | IWebhookFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	query: IDataObject = {},
	uri?: string,
): Promise<IDataObject | IDataObject[]> {
	const credentials = await this.getCredentials('cciaApi');

	const options: IHttpRequestOptions = {
		method,
		body,
		qs: query,
		url: uri || `${credentials.apiUrl}/api/v1/accounts/${credentials.accountId}${endpoint}`,
		headers: {
			'api_access_token': credentials.apiAccessToken as string,
			'Content-Type': 'application/json',
		},
		json: true,
	};

	if (Object.keys(body).length === 0) {
		delete options.body;
	}

	if (Object.keys(query).length === 0) {
		delete options.qs;
	}

	let retries = 0;
	while (retries < MAX_RETRIES) {
		try {
			const response = await this.helpers.httpRequest(options);
			return response as IDataObject;
		} catch (error) {
			// Rate limiting - HTTP 429
			if (error.statusCode === 429) {
				retries++;
				const retryAfter = error.headers?.['retry-after']
					? parseInt(error.headers['retry-after'], 10) * 1000
					: RETRY_DELAY_MS * Math.pow(2, retries);

				if (retries < MAX_RETRIES) {
					await sleep(retryAfter);
					continue;
				}
			}
			throw new NodeApiError(this.getNode(), error);
		}
	}

	throw new NodeOperationError(this.getNode(), 'Se excedio el numero maximo de reintentos');
}

/**
 * Realiza una solicitud paginada a la API de CCIA
 */
export async function cciaApiRequestAllItems(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	query: IDataObject = {},
	propertyName: string = 'payload',
): Promise<IDataObject[]> {
	const returnData: IDataObject[] = [];
	let page = 1;
	const perPage = 100;

	query.page = page;
	query.per_page = perPage;

	let responseData: IDataObject;
	do {
		responseData = await cciaApiRequest.call(this, method, endpoint, body, query) as IDataObject;
		const items = responseData[propertyName] as IDataObject[];

		if (items && Array.isArray(items)) {
			returnData.push(...items);
		}

		page++;
		query.page = page;
	} while (
		responseData[propertyName] &&
		(responseData[propertyName] as IDataObject[]).length === perPage
	);

	return returnData;
}

/**
 * Valida la firma HMAC-SHA256 de un webhook
 */
export function validateWebhookSignature(
	payload: string,
	signature: string,
	secret: string,
): boolean {
	if (!signature || !secret) {
		return false;
	}

	const expectedSignature = crypto
		.createHmac('sha256', secret)
		.update(payload, 'utf8')
		.digest('hex');

	// Comparacion en tiempo constante para evitar timing attacks
	try {
		return crypto.timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(expectedSignature),
		);
	} catch {
		return false;
	}
}

/**
 * Valida el timestamp del webhook para prevenir replay attacks
 */
export function validateWebhookTimestamp(
	timestamp: string | number,
	maxAgeSeconds: number = 300, // 5 minutos por defecto
): boolean {
	const webhookTime = typeof timestamp === 'string'
		? new Date(timestamp).getTime()
		: timestamp;
	const now = Date.now();
	const diff = Math.abs(now - webhookTime);

	return diff <= maxAgeSeconds * 1000;
}

/**
 * Sanitiza un string para prevenir injection
 */
export function sanitizeInput(input: string): string {
	if (typeof input !== 'string') {
		return String(input);
	}
	// Escapa caracteres HTML basicos
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;');
}

/**
 * Valida formato UUID
 */
export function isValidUUID(uuid: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(uuid);
}

/**
 * Valida formato ID numerico
 */
export function isValidId(id: string | number): boolean {
	const numId = typeof id === 'string' ? parseInt(id, 10) : id;
	return !isNaN(numId) && numId > 0;
}

/**
 * Helper para sleep con Promise
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normaliza datos de respuesta para output consistente
 */
export function normalizeOutput(
	event: string,
	data: IDataObject,
	metadata?: IDataObject,
): IDataObject {
	return {
		event,
		timestamp: new Date().toISOString(),
		data,
		metadata: metadata || {},
	};
}

/**
 * Obtiene opciones de carga para dropdowns
 */
export async function getInboxes(
	this: ILoadOptionsFunctions,
): Promise<Array<{ name: string; value: number }>> {
	const inboxes = await cciaApiRequestAllItems.call(
		this,
		'GET',
		'/inboxes',
		{},
		{},
		'payload',
	);

	return inboxes.map((inbox) => ({
		name: inbox.name as string,
		value: inbox.id as number,
	}));
}

export async function getTeams(
	this: ILoadOptionsFunctions,
): Promise<Array<{ name: string; value: number }>> {
	const teams = await cciaApiRequest.call(this, 'GET', '/teams') as IDataObject[];

	return (teams || []).map((team) => ({
		name: team.name as string,
		value: team.id as number,
	}));
}

export async function getAgents(
	this: ILoadOptionsFunctions,
): Promise<Array<{ name: string; value: number }>> {
	const agents = await cciaApiRequest.call(this, 'GET', '/agents') as IDataObject[];

	return (agents || []).map((agent) => ({
		name: `${agent.name} (${agent.email})`,
		value: agent.id as number,
	}));
}

export async function getLabels(
	this: ILoadOptionsFunctions,
): Promise<Array<{ name: string; value: string }>> {
	const labels = await cciaApiRequest.call(this, 'GET', '/labels') as IDataObject;
	const payload = labels.payload as IDataObject[];

	return (payload || []).map((label) => ({
		name: label.title as string,
		value: label.title as string,
	}));
}

// ============== WEBHOOK EVENT TYPES ==============

export enum WebhookEvent {
	CONVERSATION_CREATED = 'conversation.created',
	CONVERSATION_ASSIGNED = 'conversation.assigned',
	CONVERSATION_RESOLVED = 'conversation.resolved',
	CONVERSATION_REOPENED = 'conversation.reopened',
	MESSAGE_RECEIVED = 'message.received',
	MESSAGE_SENT = 'message.sent',
	CONTACT_CREATED = 'contact.created',
	CONTACT_UPDATED = 'contact.updated',
	CSAT_RECEIVED = 'csat.received',
	SLA_BREACHED = 'sla.breached',
	AGENT_STATUS_CHANGED = 'agent.status_changed',
	BOT_HANDOFF = 'bot.handoff',
}

export enum ChannelType {
	WEB_WIDGET = 'Channel::WebWidget',
	FACEBOOK = 'Channel::FacebookPage',
	TWITTER = 'Channel::TwitterProfile',
	WHATSAPP = 'Channel::Whatsapp',
	SMS = 'Channel::Sms',
	EMAIL = 'Channel::Email',
	API = 'Channel::Api',
	TELEGRAM = 'Channel::Telegram',
	LINE = 'Channel::Line',
}

// ============== NONCE TRACKING ==============

// Cache de nonces para proteccion contra replay attacks
// Se limpian automaticamente despues de TTL
const nonceCache = new Map<string, number>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Verifica si un nonce ya fue usado (replay attack)
 * Retorna true si el nonce es valido (no fue usado antes)
 */
export function validateNonce(nonce: string): boolean {
	if (!nonce) {
		return true; // Si no hay nonce, no validamos
	}

	const now = Date.now();

	// Limpiar nonces expirados
	for (const [key, timestamp] of nonceCache.entries()) {
		if (now - timestamp > NONCE_TTL_MS) {
			nonceCache.delete(key);
		}
	}

	// Verificar si el nonce ya existe
	if (nonceCache.has(nonce)) {
		return false; // Replay attack detectado
	}

	// Guardar el nonce
	nonceCache.set(nonce, now);
	return true;
}

/**
 * Genera un nonce unico
 */
export function generateNonce(): string {
	return crypto.randomBytes(16).toString('hex');
}

// ============== EVENT PAYLOAD PARSERS ==============

export interface INormalizedWebhookPayload {
	event: string;
	timestamp: string;
	id: string | number;
	data: IDataObject;
	conversation?: IDataObject;
	contact?: IDataObject;
	message?: IDataObject;
	agent?: IDataObject;
	inbox?: IDataObject;
	metadata: IDataObject;
}

/**
 * Parsea y normaliza payload de conversation.created
 */
export function parseConversationCreated(body: IDataObject): INormalizedWebhookPayload {
	const conversation = body.conversation as IDataObject || body.data as IDataObject || {};
	const contact = body.contact as IDataObject || conversation.meta?.sender as IDataObject || {};
	const inbox = body.inbox as IDataObject || {};

	return {
		event: WebhookEvent.CONVERSATION_CREATED,
		timestamp: (body.timestamp || body.created_at || new Date().toISOString()) as string,
		id: conversation.id as number,
		data: conversation,
		conversation: {
			id: conversation.id,
			status: conversation.status || 'open',
			inbox_id: conversation.inbox_id || inbox.id,
			contact_id: contact.id,
			assignee_id: conversation.assignee_id,
			team_id: conversation.team_id,
			priority: conversation.priority,
			channel: inbox.channel_type,
			created_at: conversation.created_at,
		},
		contact: {
			id: contact.id,
			name: contact.name,
			email: contact.email,
			phone_number: contact.phone_number,
		},
		inbox: {
			id: inbox.id,
			name: inbox.name,
			channel_type: inbox.channel_type,
		},
		metadata: {
			account_id: body.account_id || conversation.account_id,
			event_id: body.event_id || body.id,
		},
	};
}

/**
 * Parsea y normaliza payload de conversation.assigned
 */
export function parseConversationAssigned(body: IDataObject): INormalizedWebhookPayload {
	const conversation = body.conversation as IDataObject || body.data as IDataObject || {};
	const assignee = body.assignee as IDataObject || {};
	const team = body.team as IDataObject || {};

	return {
		event: WebhookEvent.CONVERSATION_ASSIGNED,
		timestamp: (body.timestamp || new Date().toISOString()) as string,
		id: conversation.id as number,
		data: conversation,
		conversation: {
			id: conversation.id,
			status: conversation.status,
			inbox_id: conversation.inbox_id,
			assignee_id: assignee.id || conversation.assignee_id,
			team_id: team.id || conversation.team_id,
		},
		agent: assignee.id ? {
			id: assignee.id,
			name: assignee.name,
			email: assignee.email,
		} : undefined,
		metadata: {
			account_id: body.account_id,
			previous_assignee_id: body.previous_assignee_id,
			assigned_by_id: body.assigned_by_id,
		},
	};
}

/**
 * Parsea y normaliza payload de conversation.resolved/reopened
 */
export function parseConversationStatusChanged(body: IDataObject, event: string): INormalizedWebhookPayload {
	const conversation = body.conversation as IDataObject || body.data as IDataObject || {};

	return {
		event,
		timestamp: (body.timestamp || new Date().toISOString()) as string,
		id: conversation.id as number,
		data: conversation,
		conversation: {
			id: conversation.id,
			status: conversation.status,
			inbox_id: conversation.inbox_id,
			assignee_id: conversation.assignee_id,
			resolved_at: conversation.resolved_at,
		},
		metadata: {
			account_id: body.account_id,
			changed_by_id: body.changed_by_id,
			previous_status: body.previous_status,
		},
	};
}

/**
 * Parsea y normaliza payload de message.received/sent
 */
export function parseMessage(body: IDataObject, event: string): INormalizedWebhookPayload {
	const message = body.message as IDataObject || body.data as IDataObject || {};
	const conversation = body.conversation as IDataObject || {};
	const sender = body.sender as IDataObject || message.sender as IDataObject || {};
	const contact = body.contact as IDataObject || {};

	return {
		event,
		timestamp: (body.timestamp || message.created_at || new Date().toISOString()) as string,
		id: message.id as number,
		data: message,
		message: {
			id: message.id,
			content: message.content,
			content_type: message.content_type || 'text',
			message_type: message.message_type,
			private: message.private || false,
			sender_type: sender.type || message.sender_type,
			sender_id: sender.id || message.sender_id,
			conversation_id: message.conversation_id || conversation.id,
			attachments: message.attachments,
			created_at: message.created_at,
		},
		conversation: conversation.id ? {
			id: conversation.id,
			inbox_id: conversation.inbox_id,
			status: conversation.status,
		} : undefined,
		contact: contact.id || sender.type === 'contact' ? {
			id: contact.id || sender.id,
			name: contact.name || sender.name,
			email: contact.email,
		} : undefined,
		metadata: {
			account_id: body.account_id,
			inbox_id: conversation.inbox_id,
		},
	};
}

/**
 * Parsea y normaliza payload de contact.created/updated
 */
export function parseContact(body: IDataObject, event: string): INormalizedWebhookPayload {
	const contact = body.contact as IDataObject || body.data as IDataObject || {};

	return {
		event,
		timestamp: (body.timestamp || contact.updated_at || contact.created_at || new Date().toISOString()) as string,
		id: contact.id as number,
		data: contact,
		contact: {
			id: contact.id,
			name: contact.name,
			email: contact.email,
			phone_number: contact.phone_number,
			identifier: contact.identifier,
			custom_attributes: contact.custom_attributes,
			created_at: contact.created_at,
			updated_at: contact.updated_at,
		},
		metadata: {
			account_id: body.account_id,
			changed_attributes: body.changed_attributes,
		},
	};
}

/**
 * Parsea y normaliza payload de csat.received
 */
export function parseCSAT(body: IDataObject): INormalizedWebhookPayload {
	const csat = body.csat as IDataObject || body.data as IDataObject || {};
	const conversation = body.conversation as IDataObject || {};
	const contact = body.contact as IDataObject || {};

	return {
		event: WebhookEvent.CSAT_RECEIVED,
		timestamp: (body.timestamp || csat.created_at || new Date().toISOString()) as string,
		id: csat.id as number,
		data: csat,
		conversation: conversation.id ? {
			id: conversation.id,
			inbox_id: conversation.inbox_id,
		} : undefined,
		contact: contact.id ? {
			id: contact.id,
			name: contact.name,
		} : undefined,
		metadata: {
			account_id: body.account_id,
			rating: csat.rating,
			feedback_message: csat.feedback_message,
			assigned_agent_id: csat.assigned_agent_id,
		},
	};
}

/**
 * Parsea y normaliza payload de sla.breached
 */
export function parseSLABreached(body: IDataObject): INormalizedWebhookPayload {
	const sla = body.sla as IDataObject || body.data as IDataObject || {};
	const conversation = body.conversation as IDataObject || {};

	return {
		event: WebhookEvent.SLA_BREACHED,
		timestamp: (body.timestamp || new Date().toISOString()) as string,
		id: sla.id as number || conversation.id as number,
		data: sla,
		conversation: {
			id: conversation.id,
			inbox_id: conversation.inbox_id,
			status: conversation.status,
		},
		metadata: {
			account_id: body.account_id,
			sla_policy_id: sla.sla_policy_id,
			sla_policy_name: sla.sla_policy_name,
			breach_type: sla.breach_type, // first_response, resolution
			threshold_seconds: sla.threshold_seconds,
			actual_seconds: sla.actual_seconds,
		},
	};
}

/**
 * Parsea y normaliza payload de agent.status_changed
 */
export function parseAgentStatusChanged(body: IDataObject): INormalizedWebhookPayload {
	const agent = body.agent as IDataObject || body.data as IDataObject || {};

	return {
		event: WebhookEvent.AGENT_STATUS_CHANGED,
		timestamp: (body.timestamp || new Date().toISOString()) as string,
		id: agent.id as number,
		data: agent,
		agent: {
			id: agent.id,
			name: agent.name,
			email: agent.email,
			availability_status: agent.availability_status,
			auto_offline: agent.auto_offline,
		},
		metadata: {
			account_id: body.account_id,
			previous_status: body.previous_status,
			new_status: agent.availability_status,
		},
	};
}

/**
 * Parsea y normaliza payload de bot.handoff
 */
export function parseBotHandoff(body: IDataObject): INormalizedWebhookPayload {
	const conversation = body.conversation as IDataObject || body.data as IDataObject || {};
	const contact = body.contact as IDataObject || {};
	const assignee = body.assignee as IDataObject || {};

	return {
		event: WebhookEvent.BOT_HANDOFF,
		timestamp: (body.timestamp || new Date().toISOString()) as string,
		id: conversation.id as number,
		data: conversation,
		conversation: {
			id: conversation.id,
			inbox_id: conversation.inbox_id,
			status: conversation.status,
			assignee_id: assignee.id,
		},
		contact: contact.id ? {
			id: contact.id,
			name: contact.name,
		} : undefined,
		agent: assignee.id ? {
			id: assignee.id,
			name: assignee.name,
		} : undefined,
		metadata: {
			account_id: body.account_id,
			handoff_reason: body.handoff_reason,
			bot_conversation_id: body.bot_conversation_id,
		},
	};
}

/**
 * Parser principal que delega al parser especifico segun el evento
 */
export function parseWebhookPayload(event: string, body: IDataObject): INormalizedWebhookPayload {
	switch (event) {
		case WebhookEvent.CONVERSATION_CREATED:
			return parseConversationCreated(body);
		case WebhookEvent.CONVERSATION_ASSIGNED:
			return parseConversationAssigned(body);
		case WebhookEvent.CONVERSATION_RESOLVED:
		case WebhookEvent.CONVERSATION_REOPENED:
			return parseConversationStatusChanged(body, event);
		case WebhookEvent.MESSAGE_RECEIVED:
		case WebhookEvent.MESSAGE_SENT:
			return parseMessage(body, event);
		case WebhookEvent.CONTACT_CREATED:
		case WebhookEvent.CONTACT_UPDATED:
			return parseContact(body, event);
		case WebhookEvent.CSAT_RECEIVED:
			return parseCSAT(body);
		case WebhookEvent.SLA_BREACHED:
			return parseSLABreached(body);
		case WebhookEvent.AGENT_STATUS_CHANGED:
			return parseAgentStatusChanged(body);
		case WebhookEvent.BOT_HANDOFF:
			return parseBotHandoff(body);
		default:
			// Fallback generico
			return {
				event,
				timestamp: new Date().toISOString(),
				id: body.id as number || 0,
				data: body,
				metadata: { account_id: body.account_id },
			};
	}
}

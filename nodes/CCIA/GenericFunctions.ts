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

import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CCIAApi implements ICredentialType {
	name = 'cciaApi';
	displayName = 'CCIA API';
	documentationUrl = 'https://docs.ccia.io/api/authentication';
	properties: INodeProperties[] = [
		{
			displayName: 'API URL',
			name: 'apiUrl',
			type: 'string',
			default: 'https://app.ccia.io',
			placeholder: 'https://app.ccia.io',
			description: 'URL de la instancia de CCIA',
			required: true,
		},
		{
			displayName: 'Account ID',
			name: 'accountId',
			type: 'number',
			default: 0,
			description: 'ID de la cuenta en CCIA',
			required: true,
		},
		{
			displayName: 'API Access Token',
			name: 'apiAccessToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Token de acceso de la API de CCIA. Se obtiene en Configuracion > API',
			required: true,
		},
		{
			displayName: 'Webhook Secret',
			name: 'webhookSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Secreto para validar webhooks entrantes (HMAC-SHA256)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'api_access_token': '={{$credentials.apiAccessToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.apiUrl}}',
			url: '/api/v1/profile',
			method: 'GET',
		},
	};
}

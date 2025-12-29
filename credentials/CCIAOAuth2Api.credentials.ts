import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CCIAOAuth2Api implements ICredentialType {
	name = 'cciaOAuth2Api';
	displayName = 'CCIA OAuth2 API';
	documentationUrl = 'https://docs.ccia.io/api/oauth';
	extends = ['oAuth2Api'];
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
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: '={{$credentials.apiUrl}}/oauth/authorize',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: '={{$credentials.apiUrl}}/oauth/token',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: 'read write',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
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
}

import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	NodeOperationError,
} from 'n8n-workflow';

import {
	cciaApiRequest,
	cciaApiRequestAllItems,
	getInboxes,
	getTeams,
	getAgents,
	getLabels,
	sanitizeInput,
	isValidId,
} from './GenericFunctions';

export class CCIA implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CCIA',
		name: 'ccia',
		icon: 'file:ccia.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interactua con CCIA (Contact Center IA)',
		defaults: {
			name: 'CCIA',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'cciaApi',
				required: true,
				displayOptions: {
					show: {
						authentication: ['apiKey'],
					},
				},
			},
			{
				name: 'cciaOAuth2Api',
				required: true,
				displayOptions: {
					show: {
						authentication: ['oAuth2'],
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{
						name: 'API Key',
						value: 'apiKey',
					},
					{
						name: 'OAuth2',
						value: 'oAuth2',
					},
				],
				default: 'apiKey',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Conversation',
						value: 'conversation',
					},
					{
						name: 'Message',
						value: 'message',
					},
					{
						name: 'Contact',
						value: 'contact',
					},
					{
						name: 'Agent',
						value: 'agent',
					},
				],
				default: 'conversation',
			},

			// ============== CONVERSATION OPERATIONS ==============
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['conversation'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Crear una nueva conversacion',
						action: 'Create a conversation',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Obtener una conversacion por ID',
						action: 'Get a conversation',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Obtener multiples conversaciones',
						action: 'Get many conversations',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Actualizar una conversacion',
						action: 'Update a conversation',
					},
					{
						name: 'Assign',
						value: 'assign',
						description: 'Asignar conversacion a agente o equipo',
						action: 'Assign a conversation',
					},
				],
				default: 'get',
			},

			// ============== MESSAGE OPERATIONS ==============
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['message'],
					},
				},
				options: [
					{
						name: 'Send',
						value: 'send',
						description: 'Enviar un mensaje a una conversacion',
						action: 'Send a message',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Obtener mensajes de una conversacion',
						action: 'Get many messages',
					},
				],
				default: 'send',
			},

			// ============== CONTACT OPERATIONS ==============
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['contact'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Crear un nuevo contacto',
						action: 'Create a contact',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Obtener un contacto por ID',
						action: 'Get a contact',
					},
					{
						name: 'Search',
						value: 'search',
						description: 'Buscar contactos',
						action: 'Search contacts',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Actualizar un contacto',
						action: 'Update a contact',
					},
				],
				default: 'get',
			},

			// ============== AGENT OPERATIONS ==============
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['agent'],
					},
				},
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Obtener todos los agentes',
						action: 'Get many agents',
					},
				],
				default: 'getAll',
			},

			// ============== CONVERSATION FIELDS ==============
			// Conversation ID
			{
				displayName: 'Conversation ID',
				name: 'conversationId',
				type: 'number',
				required: true,
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['get', 'update', 'assign'],
					},
				},
				default: 0,
				description: 'ID de la conversacion',
			},
			// Inbox (for create)
			{
				displayName: 'Inbox',
				name: 'inboxId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getInboxes',
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'Inbox donde crear la conversacion',
			},
			// Contact ID (for create conversation)
			{
				displayName: 'Contact ID',
				name: 'contactId',
				type: 'number',
				required: true,
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['create'],
					},
				},
				default: 0,
				description: 'ID del contacto',
			},
			// Status (for update)
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['update'],
					},
				},
				options: [
					{ name: 'Open', value: 'open' },
					{ name: 'Resolved', value: 'resolved' },
					{ name: 'Pending', value: 'pending' },
					{ name: 'Snoozed', value: 'snoozed' },
				],
				default: 'open',
				description: 'Nuevo estado de la conversacion',
			},
			// Assignee (for assign)
			{
				displayName: 'Assignee Type',
				name: 'assigneeType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['assign'],
					},
				},
				options: [
					{ name: 'Agent', value: 'agent' },
					{ name: 'Team', value: 'team' },
				],
				default: 'agent',
			},
			{
				displayName: 'Agent',
				name: 'assigneeId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAgents',
				},
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['assign'],
						assigneeType: ['agent'],
					},
				},
				default: '',
				description: 'Agente a asignar',
			},
			{
				displayName: 'Team',
				name: 'teamId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTeams',
				},
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['assign'],
						assigneeType: ['team'],
					},
				},
				default: '',
				description: 'Equipo a asignar',
			},
			// Filters for getAll
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['getAll'],
					},
				},
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['getAll'],
						returnAll: [false],
					},
				},
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				default: 25,
				description: 'Max number of results to return',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['getAll'],
					},
				},
				options: [
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'All', value: 'all' },
							{ name: 'Open', value: 'open' },
							{ name: 'Resolved', value: 'resolved' },
							{ name: 'Pending', value: 'pending' },
						],
						default: 'all',
					},
					{
						displayName: 'Inbox',
						name: 'inbox_id',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getInboxes',
						},
						default: '',
					},
					{
						displayName: 'Assigned To',
						name: 'assignee_type',
						type: 'options',
						options: [
							{ name: 'All', value: '' },
							{ name: 'Me', value: 'me' },
							{ name: 'Unassigned', value: 'unassigned' },
						],
						default: '',
					},
				],
			},

			// ============== MESSAGE FIELDS ==============
			{
				displayName: 'Conversation ID',
				name: 'conversationId',
				type: 'number',
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
					},
				},
				default: 0,
				description: 'ID de la conversacion',
			},
			{
				displayName: 'Message Content',
				name: 'content',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
					},
				},
				default: '',
				description: 'Contenido del mensaje',
			},
			{
				displayName: 'Message Type',
				name: 'messageType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
					},
				},
				options: [
					{ name: 'Outgoing', value: 'outgoing' },
					{ name: 'Private Note', value: 'private' },
				],
				default: 'outgoing',
				description: 'Tipo de mensaje',
			},

			// ============== CONTACT FIELDS ==============
			{
				displayName: 'Contact ID',
				name: 'contactId',
				type: 'number',
				required: true,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['get', 'update'],
					},
				},
				default: 0,
				description: 'ID del contacto',
			},
			{
				displayName: 'Search Query',
				name: 'searchQuery',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
					},
				},
				default: '',
				description: 'Termino de busqueda (nombre, email, telefono)',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
					},
				},
				default: '',
				description: 'Nombre del contacto',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create', 'update'],
					},
				},
				options: [
					{
						displayName: 'Email',
						name: 'email',
						type: 'string',
						placeholder: 'name@email.com',
						default: '',
					},
					{
						displayName: 'Phone Number',
						name: 'phone_number',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Identifier',
						name: 'identifier',
						type: 'string',
						default: '',
						description: 'Identificador unico externo',
					},
					{
						displayName: 'Custom Attributes',
						name: 'custom_attributes',
						type: 'json',
						default: '{}',
						description: 'Atributos personalizados en formato JSON',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			getInboxes,
			getTeams,
			getAgents,
			getLabels,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject | IDataObject[];

				// ============== CONVERSATION ==============
				if (resource === 'conversation') {
					if (operation === 'get') {
						const conversationId = this.getNodeParameter('conversationId', i) as number;
						if (!isValidId(conversationId)) {
							throw new NodeOperationError(this.getNode(), 'ID de conversacion invalido', { itemIndex: i });
						}
						responseData = await cciaApiRequest.call(this, 'GET', `/conversations/${conversationId}`);
					}

					if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const filters = this.getNodeParameter('filters', i) as IDataObject;

						if (returnAll) {
							responseData = await cciaApiRequestAllItems.call(
								this,
								'GET',
								'/conversations',
								{},
								filters,
								'data',
							);
						} else {
							const limit = this.getNodeParameter('limit', i) as number;
							filters.per_page = limit;
							const response = await cciaApiRequest.call(this, 'GET', '/conversations', {}, filters);
							responseData = (response as IDataObject).data as IDataObject[];
						}
					}

					if (operation === 'create') {
						const inboxId = this.getNodeParameter('inboxId', i) as number;
						const contactId = this.getNodeParameter('contactId', i) as number;

						const body: IDataObject = {
							inbox_id: inboxId,
							contact_id: contactId,
						};

						responseData = await cciaApiRequest.call(this, 'POST', '/conversations', body);
					}

					if (operation === 'update') {
						const conversationId = this.getNodeParameter('conversationId', i) as number;
						const status = this.getNodeParameter('status', i) as string;

						const body: IDataObject = { status };
						responseData = await cciaApiRequest.call(
							this,
							'POST',
							`/conversations/${conversationId}/toggle_status`,
							body,
						);
					}

					if (operation === 'assign') {
						const conversationId = this.getNodeParameter('conversationId', i) as number;
						const assigneeType = this.getNodeParameter('assigneeType', i) as string;

						const body: IDataObject = {};
						if (assigneeType === 'agent') {
							body.assignee_id = this.getNodeParameter('assigneeId', i) as number;
						} else {
							body.team_id = this.getNodeParameter('teamId', i) as number;
						}

						responseData = await cciaApiRequest.call(
							this,
							'POST',
							`/conversations/${conversationId}/assignments`,
							body,
						);
					}
				}

				// ============== MESSAGE ==============
				if (resource === 'message') {
					const conversationId = this.getNodeParameter('conversationId', i) as number;

					if (operation === 'send') {
						const content = sanitizeInput(this.getNodeParameter('content', i) as string);
						const messageType = this.getNodeParameter('messageType', i) as string;

						const body: IDataObject = {
							content,
							message_type: messageType === 'private' ? 'private' : 'outgoing',
							private: messageType === 'private',
						};

						responseData = await cciaApiRequest.call(
							this,
							'POST',
							`/conversations/${conversationId}/messages`,
							body,
						);
					}

					if (operation === 'getAll') {
						responseData = await cciaApiRequest.call(
							this,
							'GET',
							`/conversations/${conversationId}/messages`,
						);
					}
				}

				// ============== CONTACT ==============
				if (resource === 'contact') {
					if (operation === 'get') {
						const contactId = this.getNodeParameter('contactId', i) as number;
						if (!isValidId(contactId)) {
							throw new NodeOperationError(this.getNode(), 'ID de contacto invalido', { itemIndex: i });
						}
						responseData = await cciaApiRequest.call(this, 'GET', `/contacts/${contactId}`);
					}

					if (operation === 'search') {
						const searchQuery = sanitizeInput(this.getNodeParameter('searchQuery', i) as string);
						responseData = await cciaApiRequest.call(
							this,
							'GET',
							'/contacts/search',
							{},
							{ q: searchQuery },
						);
					}

					if (operation === 'create') {
						const name = sanitizeInput(this.getNodeParameter('name', i) as string);
						const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

						const body: IDataObject = { name };

						if (additionalFields.email) {
							body.email = additionalFields.email;
						}
						if (additionalFields.phone_number) {
							body.phone_number = additionalFields.phone_number;
						}
						if (additionalFields.identifier) {
							body.identifier = additionalFields.identifier;
						}
						if (additionalFields.custom_attributes) {
							body.custom_attributes =
								typeof additionalFields.custom_attributes === 'string'
									? JSON.parse(additionalFields.custom_attributes)
									: additionalFields.custom_attributes;
						}

						responseData = await cciaApiRequest.call(this, 'POST', '/contacts', body);
					}

					if (operation === 'update') {
						const contactId = this.getNodeParameter('contactId', i) as number;
						const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

						const body: IDataObject = {};

						if (additionalFields.email) {
							body.email = additionalFields.email;
						}
						if (additionalFields.phone_number) {
							body.phone_number = additionalFields.phone_number;
						}
						if (additionalFields.identifier) {
							body.identifier = additionalFields.identifier;
						}
						if (additionalFields.custom_attributes) {
							body.custom_attributes =
								typeof additionalFields.custom_attributes === 'string'
									? JSON.parse(additionalFields.custom_attributes)
									: additionalFields.custom_attributes;
						}

						responseData = await cciaApiRequest.call(this, 'PUT', `/contacts/${contactId}`, body);
					}
				}

				// ============== AGENT ==============
				if (resource === 'agent') {
					if (operation === 'getAll') {
						responseData = await cciaApiRequest.call(this, 'GET', '/agents');
					}
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData as IDataObject),
					{ itemData: { item: i } },
				);

				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

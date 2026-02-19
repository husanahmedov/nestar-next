import { useMemo } from 'react';
import { ApolloClient, ApolloLink, InMemoryCache, from, NormalizedCacheObject } from '@apollo/client';
import createUploadLink from 'apollo-upload-client/public/createUploadLink.js';
// import { WebSocketLink } from '@apollo/client/link/ws';
// import { getMainDefinition } from '@apollo/client/utilities';
import { onError } from '@apollo/client/link/error';
import { getJwtToken } from '../libs/auth';
import { TokenRefreshLink } from 'apollo-link-token-refresh';
let apolloClient: ApolloClient<NormalizedCacheObject>;

function getHeaders() {
	const headers = {} as HeadersInit;
	const token = getJwtToken();
	// @ts-ignore
	if (token) headers['Authorization'] = `Bearer ${token}`;
	return headers;
}

const tokenRefreshLink = new TokenRefreshLink({
	accessTokenField: 'accessToken',
	isTokenValidOrUndefined: () => {
		return true;
	}, // @ts-ignore
	fetchAccessToken: () => {
		// execute refresh token
		return null;
	},
});

// Custom WebSocket client for backend chat (NOT for GraphQL subscriptions)
interface MessagePayload {
	event: string;
	text: string;
	memberData: any;
}

interface InfoPayload {
	event: string;
	totalClients: number;
	memberData: any;
	action: 'joined' | 'left';
}

type WebSocketMessage = MessagePayload | InfoPayload;

class CustomChatWebSocket {
	private socket: WebSocket | null = null;
	private messageHandlers: Array<(data: MessagePayload) => void> = [];
	private infoHandlers: Array<(data: InfoPayload) => void> = [];
	private connectionHandlers: Array<() => void> = [];
	private errorHandlers: Array<(error: any) => void> = [];
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectInterval: any = null;

	constructor(url: string) {
		if (typeof window === 'undefined') return;
		this.connect(url);
	}

	private connect(url: string) {
		try {
			this.socket = new WebSocket(url);

			this.socket.onopen = () => {
				console.log('✅ Custom Chat WebSocket connected!');
				this.reconnectAttempts = 0;
				this.connectionHandlers.forEach((handler) => handler());
			};

			this.socket.onmessage = (event) => {
				try {
					const data: WebSocketMessage = JSON.parse(event.data);
					console.log('📨 WebSocket message received:', data);

					if (data.event === 'message') {
						this.messageHandlers.forEach((handler) => handler(data as MessagePayload));
					} else if (data.event === 'info') {
						this.infoHandlers.forEach((handler) => handler(data as InfoPayload));
					}
				} catch (err) {
					console.error('Failed to parse WebSocket message:', err);
				}
			};

			this.socket.onerror = (error) => {
				console.error('❌ WebSocket error:', error);
				this.errorHandlers.forEach((handler) => handler(error));
			};

			this.socket.onclose = () => {
				console.log('🔌 WebSocket disconnected');
				this.attemptReconnect(url);
			};
		} catch (err) {
			console.error('Failed to create WebSocket:', err);
			this.errorHandlers.forEach((handler) => handler(err));
		}
	}

	private attemptReconnect(url: string) {
		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			this.reconnectAttempts++;
			console.log(`🔄 Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
			this.reconnectInterval = setTimeout(() => {
				this.connect(url);
			}, 3000);
		}
	}

	send(text: string) {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			// NestJS WebSocket expects messages in this format
			const message = JSON.stringify({
				event: 'message',
				data: text,
			});
			this.socket.send(message);
			console.log('📤 Message sent:', text);
		} else {
			console.error('❌ WebSocket is not connected');
		}
	}

	onMessage(handler: (data: MessagePayload) => void) {
		this.messageHandlers.push(handler);
	}

	onInfo(handler: (data: InfoPayload) => void) {
		this.infoHandlers.push(handler);
	}

	onConnect(handler: () => void) {
		this.connectionHandlers.push(handler);
	}

	onError(handler: (error: any) => void) {
		this.errorHandlers.push(handler);
	}

	close() {
		if (this.reconnectInterval) {
			clearTimeout(this.reconnectInterval);
		}
		if (this.socket) {
			this.socket.close();
		}
		// Clear all handlers to prevent memory leaks and duplicates
		this.messageHandlers = [];
		this.infoHandlers = [];
		this.connectionHandlers = [];
		this.errorHandlers = [];
	}

	isConnected(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}
}

// Singleton instance
let chatWebSocket: CustomChatWebSocket | null = null;

export function initializeChatWebSocket(token?: string): CustomChatWebSocket {
	if (!chatWebSocket && typeof window !== 'undefined') {
		const wsUrl = process.env.REACT_APP_API_WS || 'ws://localhost:3007';
		const authToken = token || getJwtToken();
		const urlWithToken = `${wsUrl}${authToken ? `?token=${authToken}` : ''}`;
		chatWebSocket = new CustomChatWebSocket(urlWithToken);
	}
	return chatWebSocket!;
}

export function getChatWebSocket(): CustomChatWebSocket | null {
	return chatWebSocket;
}

export function closeChatWebSocket() {
	if (chatWebSocket) {
		chatWebSocket.close();
		chatWebSocket = null; // Reset singleton so it can be re-initialized
	}
}

function createIsomorphicLink() {
	if (typeof window !== 'undefined') {
		const authLink = new ApolloLink((operation, forward) => {
			operation.setContext(({ headers = {} }) => ({
				headers: {
					...headers,
					...getHeaders(),
				},
			}));
			console.warn('requesting.. ', operation);
			return forward(operation);
		});

		// @ts-ignore
		const link = new createUploadLink({
			uri: process.env.REACT_APP_API_GRAPHQL_URL,
		});

		/* WEBSOCKET SUBSCRIPTION LINK - DISABLED (using custom WebSocket for chat instead) */
		// const wsLink = new WebSocketLink({
		// 	uri: process.env.REACT_APP_API_WS ?? 'ws://localhost:3007',
		// 	options: {
		// 		reconnect: false,
		// 		timeout: 30000,
		// 		connectionParams: () => {
		// 			return { headers: getHeaders() };
		// 		},
		// 	},
		// });

		const errorLink = onError(({ graphQLErrors, networkError, response }) => {
			if (graphQLErrors) {
				graphQLErrors.map(({ message, locations, path, extensions }) =>
					console.log(`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`),
				);
			}
			if (networkError) console.log(`[Network error]: ${networkError}`);
			// @ts-ignore
			if (networkError?.statusCode === 401) {
			}
		});

		// No split needed - only using HTTP link (no GraphQL subscriptions)
		// const splitLink = split(
		// 	({ query }) => {
		// 		const definition = getMainDefinition(query);
		// 		return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
		// 	},
		// 	wsLink,
		// 	authLink.concat(link),
		// );

		return from([errorLink, tokenRefreshLink, authLink.concat(link)]);
	}
}

function createApolloClient() {
	return new ApolloClient({
		ssrMode: typeof window === 'undefined',
		link: createIsomorphicLink(),
		cache: new InMemoryCache(),
		resolvers: {},
	});
}

export function initializeApollo(initialState = null) {
	const _apolloClient = apolloClient ?? createApolloClient();
	if (initialState) _apolloClient.cache.restore(initialState);
	if (typeof window === 'undefined') return _apolloClient;
	if (!apolloClient) apolloClient = _apolloClient;

	return _apolloClient;
}

export function useApollo(initialState: any) {
	return useMemo(() => initializeApollo(initialState), [initialState]);
}

/**
import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";

// No Subscription required for develop process

const httpLink = createHttpLink({
  uri: "http://localhost:3007/graphql",
});

const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
});

export default client;
*/

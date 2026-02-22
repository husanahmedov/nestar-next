import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, Box, Stack } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import Badge from '@mui/material/Badge';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import MarkChatUnreadIcon from '@mui/icons-material/MarkChatUnread';
import { useRouter } from 'next/router';
import ScrollableFeed from 'react-scrollable-feed';
import { initializeChatWebSocket, getChatWebSocket, closeChatWebSocket } from '../../apollo/client';
import { useReactiveVar } from '@apollo/client';
import { userVar } from '../../apollo/store';
import { REACT_APP_API_URL } from '../config';

interface MessageData {
	event: string;
	text: string;
	memberData: {
		_id: string;
		memberNick: string;
		memberImage?: string;
	} | null;
}

const Chat = () => {
	const chatContentRef = useRef<HTMLDivElement>(null);
	const [messagesList, setMessagesList] = useState<MessageData[]>([]);
	const [onlineUsers, setOnlineUsers] = useState<number>(0);
	const textInput = useRef<HTMLInputElement>(null);
	const [message, setMessage] = useState<string>('');
	const [open, setOpen] = useState(false);
	const [openButton, setOpenButton] = useState(false);
	const [isConnected, setIsConnected] = useState(false);
	const router = useRouter();
	const user = useReactiveVar(userVar);

	/** LIFECYCLES **/
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			setOpenButton(true);
		}, 100);
		return () => clearTimeout(timeoutId);
	}, []);

	useEffect(() => {
		setOpenButton(false);
	}, [router.pathname]);

	useEffect(() => {
		if (typeof window === 'undefined') return;

		// Initialize WebSocket
		const ws = initializeChatWebSocket();

		// Define handlers
		const handleConnect = () => {
			console.log('✅ Chat connected!');
			setIsConnected(true);
		};

		const handleMessage = (data: MessageData) => {
			console.log('📩 New message:', data);
			setMessagesList((prev) => [...prev, data]);
		};

		const handleInfo = (data: any) => {
			console.log('ℹ️ Info update:', data);
			setOnlineUsers(data.totalClients);

			// // Show join/leave notifications
			// if (data.action === 'joined' && data.memberData) {
			// 	const joinMsg: MessageData = {
			// 		event: 'system',
			// 		text: `${data.memberData.memberNick} joined the chat`,
			// 		memberData: null,
			// 	};
			// 	setMessagesList((prev) => [...prev, joinMsg]);
			// } else if (data.action === 'left' && data.memberData) {
			// 	const leaveMsg: MessageData = {
			// 		event: 'system',
			// 		text: `${data.memberData.memberNick} left the chat`,
			// 		memberData: null,
			// 	};
			// 	setMessagesList((prev) => [...prev, leaveMsg]);
			// }
		};

		const handleError = (error: any) => {
			console.error('❌ WebSocket error:', error);
			setIsConnected(false);
		};

		// Register handlers
		ws.onConnect(handleConnect);
		ws.onMessage(handleMessage);
		ws.onInfo(handleInfo);
		ws.onError(handleError);

		return () => {
			// Cleanup will clear all handlers
			closeChatWebSocket();
		};
	}, []);

	/** HANDLERS **/
	const handleOpenChat = () => {
		setOpen((prevState) => !prevState);
	};

	const getInputMessageHandler = useCallback(
		(e: any) => {
			const text = e.target.value;
			setMessage(text);
		},
		[message],
	);

	const getKeyHandler = (e: any) => {
		try {
			if (e.key == 'Enter') {
				onClickHandler();
			}
		} catch (err: any) {
			console.log(err);
		}
	};

	const onClickHandler = () => {
		if (!message.trim()) return;

		const ws = getChatWebSocket();
		if (ws && ws.isConnected()) {
			// Just send the message - don't add it locally
			// The server will broadcast it back to us
			ws.send(message);
			setMessage('');
			if (textInput.current) {
				textInput.current.value = '';
			}
		} else {
			console.error('WebSocket is not connected');
		}
	};

	return (
		<Stack className="chatting">
			{openButton ? (
				<button className="chat-button" onClick={handleOpenChat}>
					{open ? <CloseFullscreenIcon /> : <MarkChatUnreadIcon />}
				</button>
			) : null}
			<Stack className={`chat-frame ${open ? 'open' : ''}`}>
				<Box className={'chat-top'} component={'div'}>
					<div style={{ fontFamily: 'Nunito' }}>
						Online Chat {!isConnected && <span style={{ color: '#ff6b6b' }}>● Disconnected</span>}
					</div>
					<Badge
						style={{
							margin: '-30px 0 0 20px',
							color: '#33c1c1',
							background: 'none',
						}}
						badgeContent={onlineUsers}
					/>
				</Box>
				<Box className={'chat-content'} id="chat-content" ref={chatContentRef} component={'div'}>
					<ScrollableFeed>
						<Stack className={'chat-main'}>
							<Box flexDirection={'row'} style={{ display: 'flex' }} sx={{ m: '10px 0px' }} component={'div'}>
								<div className={'welcome'}>Welcome to Live Chat! 💬</div>
							</Box>

							{messagesList.map((msg, index) => {
								const isMyMessage = msg.memberData?._id === user?._id;
								const isSystemMessage = msg.event === 'system';
								const memberImage = msg.memberData?.memberImage
									? `${REACT_APP_API_URL}/${msg.memberData.memberImage}`
									: '/img/profile/defaultUser.svg';

								if (isSystemMessage) {
									return (
										<Box
											key={index}
											flexDirection={'row'}
											style={{ display: 'flex', justifyContent: 'center' }}
											sx={{ m: '5px 0px' }}
											component={'div'}
										>
											<div style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>{msg.text}</div>
										</Box>
									);
								}

								if (isMyMessage) {
									return (
										<Box
											key={index}
											component={'div'}
											flexDirection={'row'}
											style={{ display: 'flex' }}
											alignItems={'flex-end'}
											justifyContent={'flex-end'}
											sx={{ m: '10px 0px' }}
										>
											<div className={'msg-right'}>
												<div style={{ wordBreak: 'break-word' }}>{msg.text}</div>
											</div>
										</Box>
									);
								} else {
									return (
										<Box
											key={index}
											flexDirection={'row'}
											style={{ display: 'flex' }}
											sx={{ m: '10px 0px' }}
											component={'div'}
										>
											<Avatar alt={msg.memberData?.memberNick || 'Guest'} src={memberImage} />
											<div className={'msg-left'}>
												<div style={{ wordBreak: 'break-word' }}>{msg.text}</div>
											</div>
										</Box>
									);
								}
							})}
						</Stack>
					</ScrollableFeed>
				</Box>
				<Box className={'chat-bott'} component={'div'}>
					<input
						ref={textInput}
						type={'text'}
						name={'message'}
						className={'msg-input'}
						placeholder={isConnected ? 'Type message' : 'Connecting...'}
						onChange={getInputMessageHandler}
						onKeyDown={getKeyHandler}
						disabled={!isConnected}
						value={message}
					/>
					<button className={'send-msg-btn'} onClick={onClickHandler} disabled={!isConnected || !message.trim()}>
						<SendIcon style={{ color: '#fff' }} />
					</button>
				</Box>
			</Stack>
		</Stack>
	);
};

export default Chat;

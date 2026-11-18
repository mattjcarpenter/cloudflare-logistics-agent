import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';

function App() {
	const [input, setInput] = useState('');
	const [connected, setConnected] = useState(false);

	// Opens a WebSocket to /agents/logistics-agent/demo. Same name = same Durable Object = same history,
	// so a page refresh brings the conversation back. A per-user id would go here in production.
	const agent = useAgent({
		agent: 'LogisticsAgent',
		name: 'demo',
		onOpen: () => setConnected(true),
		onClose: () => setConnected(false),
	});

	// Chat state on top of that socket: history comes from the agent's SQLite, not the browser
	const { messages, sendMessage, clearHistory, status } = useAgentChat({ agent });
	const busy = status === 'submitted' || status === 'streaming';

	const send = () => {
		const text = input.trim();
		if (!text || busy) return;
		sendMessage({ role: 'user', parts: [{ type: 'text', text }] });
		setInput('');
	};

	return (
		<main style={{ maxWidth: 640, margin: '2rem auto', fontFamily: 'system-ui', padding: '0 1rem' }}>
			<h1 style={{ fontSize: 20 }}>Logistics assistant</h1>
			<p style={{ color: '#666', fontSize: 13 }}>
				Socket: {connected ? 'connected' : 'disconnected'} · Status: {status} ·{' '}
				<button onClick={clearHistory}>Clear history</button>
			</p>

			{messages.map((message) => (
				<div key={message.id} style={{ margin: '1rem 0' }}>
					<strong>{message.role}</strong>
					{message.parts.map((part, i) =>
						part.type === 'text' ? (
							<p key={i} style={{ whiteSpace: 'pre-wrap', margin: '0.25rem 0' }}>{part.text}</p>
						) : part.type.startsWith('tool-') ? (
							// Tool calls stream to the client as their own parts, so the UI can show progress
							<p key={i} style={{ color: '#888', fontSize: 13, margin: '0.25rem 0' }}>🔧 {part.type.slice(5)}</p>
						) : null,
					)}
				</div>
			))}

			<form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: 'flex', gap: 8 }}>
				<input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Where's ORD-1003?" style={{ flex: 1 }} disabled={busy} />
				<button type="submit" disabled={busy}>Send</button>
			</form>
		</main>
	);
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);

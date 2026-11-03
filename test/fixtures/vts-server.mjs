import { WebSocketServer } from 'ws';
import { once } from 'node:events';

export async function createMockVts(handler = () => ({}), { port = 0 } = {}) {
  const server = new WebSocketServer({ host: '127.0.0.1', port });
  await once(server, 'listening');
  const requests = [];
  server.on('connection', (socket) => {
    socket.on('message', async (raw) => {
      const request = JSON.parse(raw);
      requests.push(request);
      const respond = (data, messageType = request.messageType.replace(/Request$/, 'Response')) => {
        if (socket.readyState === 1) socket.send(JSON.stringify({
          apiName: 'VTubeStudioPublicAPI', apiVersion: '1.0',
          requestID: request.requestID, messageType, data
        }));
      };
      const result = await handler(request, respond, socket);
      if (result !== undefined) respond(result);
    });
  });
  return {
    port: server.address().port,
    requests,
    dropConnections() { for (const socket of server.clients) socket.terminate(); },
    async close() {
      for (const socket of server.clients) socket.terminate();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

export async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condicion no alcanzada');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
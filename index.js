const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-connector');
const http = require('http');
const WebSocket = require('ws');

// 1. Definimos el PUERTO donde correrá tu servidor
const PORT = 8080;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let connection = null, wsClient = null;
let connected = false;

// Permite servir el archivo public/index.html y otros archivos estáticos
app.use(express.static('public'));
app.use(express.json());

wss.on('connection', ws => {
  wsClient = ws;

  ws.on('message', async raw => {
    const parsed = JSON.parse(raw);

    if (parsed.type === 'connect' && !connected) {
      const username = parsed.username;
      connection = new WebcastPushConnection(username);

      try {
        await connection.connect();
        connected = true;
        ws.send(JSON.stringify({ type: 'status', message: `Conectado al Live de @${username}` }));

        connection.on('chat', data => {
          ws.send(JSON.stringify({ type: 'chat', username: data.uniqueId, text: data.comment }));
        });

        connection.on('member', data => {
          ws.send(JSON.stringify({ type: 'join', username: data.uniqueId }));
        });

        connection.on('follow', data => {
          ws.send(JSON.stringify({ type: 'follow', username: data.uniqueId }));
        });

        // Lógica de Regalos (GIFT) con Agradecimiento
        connection.on('gift', data => {
            // Usamos repeatEnd para disparar el mensaje de agradecimiento solo al final
            if (data.giftName && data.repeatEnd === 1) {
                const thankYouMessage = `¡Gracias a @${data.uniqueId} por el increíble regalo: ${data.giftName} (x${data.repeatCount || 1})!`;
                
                // 1. Envía el evento GIFT original al cliente
                ws.send(JSON.stringify({ 
                    type: 'gift', 
                    username: data.uniqueId, 
                    gift: data.giftName,
                    count: data.repeatCount || 1
                }));
                
                // 2. Envía un mensaje de chat especial con el agradecimiento
                ws.send(JSON.stringify({ 
                    type: 'chat', 
                    username: 'Sistema', 
                    text: thankYouMessage,
                    isSystem: true // Marca este mensaje como especial
                }));
            }
        });

      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: '❌ Error al conectar: ' + err.message }));
      }

    } else if (parsed.type === 'disconnect') {
      if (connection) {
        connection.disconnect();
        connected = false;
        ws.send(JSON.stringify({ type: 'status', message: 'Desconectado del Live.' }));
      }
    }
  });
});

// 2. Iniciamos el servidor en el puerto definido
server.listen(PORT, () => {
  console.log(`✅ Servidor iniciado en http://localhost:${PORT}`);
  console.log(`Abra http://localhost:${PORT} en su navegador para usar la interfaz.`);
});

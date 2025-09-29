//bot de tiktok para leer comentarios alertas
const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-connector');
const http = require('http');
const WebSocket = require('ws');

// 1. Define el PUERTO donde correrá tu servidor
// Se usa un puerto común como 8080.
const PORT = 8080; 

const app = express();
// Creamos el servidor HTTP
const server = http.createServer(app);
// Creamos el servidor WebSocket adjunto al servidor HTTP
const wss = new WebSocket.Server({ server });

let connection = null, wsClient = null;
let connected = false;

// Permite servir archivos estáticos (como un HTML) desde la carpeta 'public'
app.use(express.static('public'));
app.use(express.json());

// --- Lógica del WebSocket ---
wss.on('connection', ws => {
  // Guardamos la referencia al cliente conectado
  wsClient = ws;

  ws.on('message', async raw => {
    // Parsea el mensaje JSON que viene del cliente (ej. un navegador)
    const parsed = JSON.parse(raw);

    // Lógica para CONECTARSE a un Live de TikTok
    if (parsed.type === 'connect' && !connected) {
      const username = parsed.username;
      connection = new WebcastPushConnection(username);

      try {
        await connection.connect();
        connected = true;
        // Notifica al cliente que la conexión fue exitosa
        ws.send(JSON.stringify({ type: 'status', message: `Conectado al Live de @${username}` }));

        // --- Eventos de TikTok Live ---

        // CHAT: Se envía el mensaje y el usuario
        connection.on('chat', data => {
          ws.send(JSON.stringify({ type: 'chat', username: data.uniqueId, text: data.comment }));
        });

        // ENTRA UN MIEMBRO
        connection.on('member', data => {
          ws.send(JSON.stringify({ type: 'join', username: data.uniqueId }));
        });

        // ALGUIEN SIGUE
        connection.on('follow', data => {
          ws.send(JSON.stringify({ type: 'follow', username: data.uniqueId }));
        });

        // REGALOS (GIFT): Aquí es donde puedes agregar tu lógica para agradecer!
        connection.on('gift', data => {
          // El 'repeatEnd' ayuda a identificar cuando el usuario deja de enviar el mismo regalo
          if (data.giftName && data.repeatEnd === 1) { 
            const thankYouMessage = `¡Muchísimas gracias a @${data.uniqueId} por el regalo de ${data.giftName}!`;
            console.log(thankYouMessage); // Imprime en tu terminal de Termux
            
            // Envía el evento del regalo al cliente (p. ej., para mostrarlo en una web)
            ws.send(JSON.stringify({ 
                type: 'gift', 
                username: data.uniqueId, 
                gift: data.giftName,
                thankYou: thankYouMessage // Opcional: Envía el mensaje de agradecimiento
            }));
            
            // Si quieres que el agradecimiento se muestre como un "chat" especial:
            ws.send(JSON.stringify({ 
                type: 'chat', 
                username: 'Sistema', 
                text: thankYouMessage,
                isSystem: true
            }));
          }
        });

      } catch (err) {
        // En caso de error de conexión
        ws.send(JSON.stringify({ type: 'error', message: '❌ Error al conectar: ' + err.message }));
        console.error('Error al conectar:', err.message);
      }

    // Lógica para DESCONECTARSE
    } else if (parsed.type === 'disconnect') {
      if (connection) {
        connection.disconnect();
        connected = false;
        ws.send(JSON.stringify({ type: 'status', message: 'Desconectado del Live.' }));
        console.log('Desconectado del Live.');
      }
    }
  });
});

// 2. Iniciamos el servidor en el puerto definido
server.listen(PORT, '0.0.0.0', () => {
  // Usar '0.0.0.0' asegura que el servidor sea accesible en tu red local (LAN)
  // lo cual es útil si quieres verlo en otro dispositivo, aunque con Termux
  // `localhost` o `127.0.0.1` también funcionarán para acceder desde el mismo Termux.
  console.log(`✅ Servidor iniciado en http://localhost:${PORT}`);
  console.log(`📡 Para conectarte desde otro dispositivo usa la IP de tu Termux en el puerto ${PORT}`);
});

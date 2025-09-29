const express = require('express');
const fetch = require('node-fetch'); // Necesario para hacer llamadas a tu API
const { WebcastPushConnection } = require('tiktok-live-connector');
const http = require('http');
const WebSocket = require('ws');

const PORT = 8080; 

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let connection = null, wsClient = null;
let connected = false;

// --- Configuración API, Música y Seguidores ---
// ¡¡¡CAMBIA ESTA URL por la URL base de tu servicio API real!!!
const BASE_API_URL = 'http://TU_URL_BASE_AQUI/search?q='; 

const followers = new Set();
const musicQueue = [];
let currentSong = null;

async function searchAndQueueMusic(query, username) {
    const url = `${BASE_API_URL}${encodeURIComponent(query)}`; 

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Error al buscar música: ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        
        // Asume que el primer track de la respuesta JSON es el que se añade.
        const track = data.tracks && data.tracks.length > 0 ? data.tracks[0] : null;
        
        if (track && track.url) {
             const newSong = { 
                id: track.id, 
                title: track.title, 
                artist: track.artist,
                requestedBy: username, 
                source: track.url // URL de reproducción real de tu API
            }; 
            musicQueue.push(newSong);
            return newSong;
        }

        return null; // No se encontró la canción o faltaba la URL
    } catch (error) {
        console.error('Error durante la llamada a la API:', error);
        return null;
    }
}

function playNextSong() {
    if (musicQueue.length > 0) {
        currentSong = musicQueue.shift();
    } else {
        currentSong = null;
    }
}
// -----------------------------------------------------------------

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

        // Eventos de TikTok Live
        connection.on('chat', async data => { // Hacemos la función ASÍNCRONA
          const username = data.uniqueId;
          const text = data.comment.trim();
          const isFollower = followers.has(username);
          
          let responseMessage = null;

          // 1. Manejo de Comandos (Solo si es seguidor)
          if (isFollower && text.startsWith('!')) {
              const parts = text.split(/\s+/);
              const command = parts[0].toLowerCase();
              const argument = parts.slice(1).join(' ');

              if (command === '!play') {
                  if (argument) {
                      // ** Usamos await **
                      const song = await searchAndQueueMusic(argument, username); 
                      
                      if (song) {
                          responseMessage = `🎶 @${username} añadió '${song.title}' a la cola. Posición #${musicQueue.length}.`;
                          if (!currentSong) {
                             playNextSong();
                             responseMessage = `🎶 Reproduciendo ahora: ${currentSong.title}. Solicitada por @${currentSong.requestedBy}`;
                          }
                      } else {
                         responseMessage = `No se encontró la canción '${argument}'.`;
                      }
                  } else {
                      responseMessage = `Comando '!play': Especifica el nombre de la canción.`;
                  }
              } else if (command === '!pausar') {
                  responseMessage = '⏸️ Música pausada (comando de seguidor).';
              } else if (command === '!pasar') {
                  responseMessage = '⏭️ ¡El comando !pasar solo puede ser usado por el administrador!';
              }
              
              if (responseMessage) {
                  ws.send(JSON.stringify({ type: 'chat', username: 'Sistema', text: responseMessage, isSystem: true }));
              }
          } else {
              ws.send(JSON.stringify({ type: 'chat', username: username, text: text }));
          }

          // Notifica al cliente (frontend) sobre cualquier cambio en la música.
          ws.send(JSON.stringify({ 
              type: 'music_update', 
              current: currentSong, 
              queue: musicQueue 
          }));

        }); // Fin connection.on('chat')

        connection.on('member', data => {
          ws.send(JSON.stringify({ type: 'join', username: data.uniqueId }));
        });

        connection.on('follow', data => {
          followers.add(data.uniqueId); 
          ws.send(JSON.stringify({ type: 'follow', username: data.uniqueId }));
        });

        connection.on('gift', data => {
            if (data.giftName && data.repeatEnd === 1) { 
                ws.send(JSON.stringify({ 
                    type: 'gift', 
                    username: data.uniqueId, 
                    gift: data.giftName,
                    count: data.repeatCount || 1
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
    } else if (parsed.type === 'music_command') {
        // Lógica de comandos de música de ADMINISTRADOR (botones del cliente)
        const command = parsed.command;
        let responseMessage = null;

        if (command === 'pausar') {
            // El cliente (main.js) maneja la pausa directamente en el audio.
            responseMessage = '⏸️ El administrador pausó la música.'; 
        } else if (command === 'pasar') {
            playNextSong();
            responseMessage = currentSong ? `⏭️ El administrador pasó a: ${currentSong.title}` : 'La cola de música ha terminado.';
        }
        
        ws.send(JSON.stringify({ 
            type: 'music_update', 
            current: currentSong, 
            queue: musicQueue 
        }));
        
        if (responseMessage) {
            ws.send(JSON.stringify({ type: 'chat', username: 'Sistema', text: responseMessage, isSystem: true }));
        }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor iniciado en http://localhost:${PORT}`);
  console.log(`Abra http://localhost:${PORT} en su navegador.`);
});

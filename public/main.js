let ws;
const chatBox = document.getElementById('chat-messages');
const alertBox = document.getElementById('alert-box');
const statusIndicator = document.getElementById('status');
const usernameInput = document.getElementById('username');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const currentSongDisplay = document.getElementById('current-song');
const playlistQueue = document.getElementById('playlist-queue');
const audioPlayer = document.getElementById('audio-player'); // Reproductor de audio

const localFollowers = new Set();
// Asegúrate de que este archivo de sonido exista en public/sounds/
const joinSound = new Audio('sounds/join.mp3'); 

// --- Funciones de Utilidad ---

function speak(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); 
    let msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'es-ES';
    msg.rate = 1.0;
    msg.pitch = 1.0;
    window.speechSynthesis.speak(msg);
  }
}

function addMessage(type, content, username = null, isSystem = false) {
  const d = document.createElement('div');
  let innerHTML = '';
  
  let className = 'chat-msg';
  if (isSystem) {
      className += ' msg-system';
      innerHTML = content;
  } else if (username) {
      className += ` msg-${type}`;
      innerHTML = `<span class="username">@${username}</span>: ${content}`;
  } else {
      className += ' msg-info';
      innerHTML = content;
  }

  d.className = className;
  d.innerHTML = innerHTML;

  chatBox.appendChild(d);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showAlert(msg) {
  alertBox.textContent = msg;
  alertBox.classList.remove('hidden');
  setTimeout(() => alertBox.classList.add('hidden'), 5000); 
}

function updateConnectionStatus(isConnected, message) {
    statusIndicator.textContent = `Estado: ${message}`;
    if (isConnected) {
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        usernameInput.disabled = true;
        statusIndicator.style.backgroundColor = '#10b981';
    } else {
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        usernameInput.disabled = false;
        statusIndicator.style.backgroundColor = '#ef4444';
    }
}

// --- Funciones de Música ---

function updateMusicQueueUI(queue, current = null) {
    
    // Si la canción actual cambia y tiene una fuente, intenta reproducirla
    if (current && current.title) {
        currentSongDisplay.textContent = `🎵 Reproduciendo: ${current.title} (Solicitada por @${current.requestedBy})`;
        
        if (current.source && audioPlayer.src !== current.source) {
             audioPlayer.src = current.source;
             // El .catch() es importante para manejar errores de permisos en el navegador
             audioPlayer.play().catch(e => console.error("Error al intentar reproducir audio. Intente hacer click en la pantalla primero:", e));
             audioPlayer.onended = () => sendMusicCommand('pasar'); // Pasa a la siguiente al terminar
        }

    } else {
        currentSongDisplay.textContent = 'Canción Actual: Ninguna';
        audioPlayer.pause();
        audioPlayer.src = ''; 
    }
    
    // Actualiza la lista de espera
    playlistQueue.innerHTML = '';
    if (queue.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'La cola está vacía.';
        playlistQueue.appendChild(li);
        return;
    }

    queue.forEach((song, index) => {
        const li = document.createElement('li');
        li.innerHTML = `**${index + 1}.** ${song.title} <span style="color: #9ca3af;">(Pedida por @${song.requestedBy})</span>`;
        playlistQueue.appendChild(li);
    });
}

function sendMusicCommand(command) {
    if (command === 'pausar') {
        audioPlayer.pause();
        addMessage('chat', '⏸️ Música pausada por el administrador.', 'Sistema', true); 
    } else if (command === 'pasar') {
        // Envía el comando al servidor para que actualice la cola y envíe la URL de la siguiente canción
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'music_command', command: command }));
        }
    }
}

// --- Lógica de Conexión ---

function connect() {
  const username = usernameInput.value.trim();
  if (!username) return alert('Por favor, ingresa el nombre de usuario del Live.');

  ws = new WebSocket(`ws://${window.location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'connect', username }));
    updateConnectionStatus(true, `Intentando conectar a @${username}...`);
  };

  ws.onmessage = ({ data }) => {
    const d = JSON.parse(data);
    
    switch (d.type) {
        case 'status':
            updateConnectionStatus(true, d.message);
            break;
            
        case 'error':
            alert(d.message);
            updateConnectionStatus(false, 'Error de conexión');
            break;
            
        case 'join':
            addMessage('join', `@${d.username} se ha unido al live!`, d.username);
            joinSound.play();
            break;

        case 'follow':
            localFollowers.add(d.username);
            const followMsg = `¡Muchas gracias por Seguirme, ${d.username}!`;
            addMessage('follow', followMsg, d.username);
            speak(followMsg); 
            showAlert(followMsg);
            break;

        case 'gift':
            const giftText = `Muchas gracias por tu ${d.gift} querido seguidor ${d.username}`;
            addMessage('gift', `Ha enviado ${d.gift} (x${d.count || 1})`, d.username);
            speak(giftText); 
            showAlert(giftText);
            break;
            
        case 'chat':
            const isFollower = localFollowers.has(d.username);
            
            if (d.isSystem) {
                addMessage('chat', d.text, d.username, true);
                speak(d.text);
            } else {
                const chatMsg = d.text;
                addMessage('chat', chatMsg, d.username);

                // El bot SOLO lee el chat si el usuario es SEGUIDOR
                if (isFollower) {
                    speak(`${d.username} dice: ${chatMsg}`);
                }
            }
            break;
        
        case 'music_update':
            // Actualiza la interfaz de la cola de música y controla el audio
            updateMusicQueueUI(d.queue || [], d.current);
            break;
    }
  };
  
  ws.onclose = () => {
      updateConnectionStatus(false, 'Desconectado del servidor.');
      localFollowers.clear();
  };
  
  ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      updateConnectionStatus(false, 'Error en la conexión WebSocket');
  };
}

function disconnect() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'disconnect' }));
    updateConnectionStatus(false, 'Desconectado del Live.');
    ws.close();
  }
}

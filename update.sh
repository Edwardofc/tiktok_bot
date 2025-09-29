#!/data/data/com.termux/files/usr/bin/bash
# =======================================================
# SCRIPT DE ACTUALIZACIÓN AUTOMÁTICA DEL PROYECTO
# Ejecutar con: ./update.sh
# By Arcanoloch-Group 
# By Edwardofc 
# =======================================================

# --- CONFIGURACIÓN ---
PROJECT_NAME="TikTok Live Bot Aronix"
# URL de tu repositorio GitHub
GIT_REPO_URL="https://github.com/Edwardofc/tiktok_bot"
REQUIRED_NODE_MODULES="package.json"
# ---------------------

echo "=========================================================="
echo "          🤖 Iniciando actualización de ${PROJECT_NAME}           "
echo "=========================================================="
echo "Fecha y hora: $(date)"

# --- 1. Verificar dependencias básicas (Git) ---
if ! command -v git &> /dev/null
then
    echo "❌ Error: Git no está instalado. Ejecuta 'pkg install git'."
    exit 1
fi

# --- 2. Preparar el directorio ---
REPO_DIR=$(dirname "$0")
cd "$REPO_DIR"

echo "Directorio actual: $(pwd)"
echo "----------------------------------------------------------"

# --- 3. Verificar si el directorio es un repositorio Git ---
if [ -d ".git" ]; then
    echo "🔍 Repositorio Git detectado. Obteniendo últimos cambios..."
    
    # Intenta hacer un pull (solo fast-forward)
    GIT_OUTPUT=$(git pull --ff-only 2>&1)
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
        if echo "$GIT_OUTPUT" | grep -q "Already up to date."; then
            echo "✅ Repositorio ya está actualizado. No hay cambios nuevos."
            CHANGES_DETECTED=0
        else
            echo "✅ Actualización de código exitosa."
            CHANGES_DETECTED=1
        fi
    else
        echo "⚠️ ADVERTENCIA: Error al obtener los cambios. Esto podría ser por conflictos o cambios locales."
        echo "Intenta hacer un 'git reset --hard origin/main' si sabes que quieres descartar cambios locales."
        echo "Salida de Git:"
        echo "$GIT_OUTPUT"
        CHANGES_DETECTED=1 # Forzar la reinstalación por seguridad
    fi

else
    echo "⚠️ ADVERTENCIA: No se detectó un repositorio Git. Clonando el proyecto por primera vez..."
    
    # Clonar solo si no existe el .git, pero es un caso que no debería pasar si se usa este script
    # Ya que se asume que lo ejecutas dentro de la carpeta clonada.
    echo "Por favor, primero usa 'git clone ${GIT_REPO_URL}' para obtener el proyecto."
    exit 1
fi

echo "----------------------------------------------------------"

# --- 4. Reinstalar dependencias (si hubo cambios) ---
if [ $CHANGES_DETECTED -eq 1 ] || [ ! -d "node_modules" ]; then
    
    if [ ! -f "$REQUIRED_NODE_MODULES" ]; then
        echo "❌ Error: No se encontró el archivo ${REQUIRED_NODE_MODULES}. Abortando la reinstalación de módulos."
        exit 1
    fi
    
    echo "🔨 Instalando/actualizando dependencias de Node.js..."
    
    npm install --silent

    if [ $? -eq 0 ]; then
        echo "✅ Dependencias de Node.js instaladas correctamente."
    else
        echo "❌ Error al instalar las dependencias de Node.js (npm install). Revisa el package.json."
        exit 1
    fi
else
    echo "⏭️ No se detectaron cambios que requieran reinstalar dependencias. Omitiendo la instalación."
fi

echo "----------------------------------------------------------"
echo "🎉 ¡Actualización de ${PROJECT_NAME} completada! 🎉"
echo "=========================================================="

exit 0

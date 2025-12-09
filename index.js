// ==============================================================================
// 1. IMPORTACIÓN DE LIBRERÍAS
// ==============================================================================
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// ==============================================================================
// 2. CONFIGURACIÓN INICIAL Y CONSTANTES
// ==============================================================================

const DB_FILE = 'economia_db.json';
const COMANDOS_PREFIJO = '#';
const WORK_COOLDOWN = 60; // 1 minuto en segundos

// TRABAJOS Y SALARIOS
const TRABAJOS = {
    "Obrero": 600, "Cajero": 550, "Jardinero": 520, "Reponedor": 530,
    "Paseador de Perros": 650, "Mesero": 580, "Recepcionista": 700,
    "Ayudante de Cocina": 620, "Técnico de Soporte": 750, "Barista": 570,
    "Conductor": 680, "Vendedor": 600, "Limpiador": 510, "Asistente": 630,
    "Albañil": 610,
};

// RANGOS Y REQUISITOS
const RANGOS = {
    "Empleado": 0, "Supervisor": 15000, "Gerente": 50000, "Director": 150000,
    "Jefe": 500000
};
const RANK_ORDER = Object.keys(RANGOS);

// RAREZAS Y PESOS
const RAREZAS = {
    "Común": 50, "Raro": 40, "Épico": 25, "Legendario": 10,
    "Mítico": 5, "Super Legendario": 1, "Dios": 0.5,
};

// MASCOTAS
const MASCOTAS = {
    "Común": ["Perro Callejero", "Gato Doméstico", "Hámster"],
    "Raro": ["Búho Mensajero", "Serpiente Real", "Loro Parlanchín"],
    "Épico": ["Dragón Bebé", "Lobo de Hielo", "Fénix Dorado"],
    "Legendario": ["Tigre de Bengala", "Kraken Joven", "Grifo"],
    "Mítico": ["Unicornio Espectral", "Golem de Piedra", "Basilisco"],
    "Super Legendario": ["Leviathan Ancestral", "Cthulhu Dormido"],
    "Dios": ["Zeus Mini", "Hades Mascota"],
};

// OBJETOS EN VENTA
const PRECIOS = {
    "Caja Misteriosa": 1500,
    "Huevo de Mascota": 2500,
    "Kit de Curación": 500,
};

// EMOCIONES Y GIFS (Simulados)
const EMOCIONES = {
    "tristeza": "triste.gif", "alegria": "feliz.gif", "enfado": "enojado.gif",
    "amor": "corazones.gif", "risa": "jaja.gif", "llorar": "llorando.gif",
    "dormir": "dormido.gif", "sorpresa": "wow.gif", "beso": "kiss.gif",
    "abrazo": "hug.gif", "baile": "dancing.gif", "decepcion": "meh.gif",
};

// Se elimina ADMIN_IDS, el permiso se basará en el rol de grupo

// ==============================================================================
// 3. GESTIÓN DE LA BASE DE DATOS (JSON)
// ==============================================================================

function cargarDB() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            console.error("⚠️ Error al leer DB. Iniciando vacío.", e);
            return {};
        }
    }
    return {};
}

function guardarDB(db) {
    // Guarda el estado actual en el archivo DB_FILE
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
}

function get_user_data(db, user_id) {
    return db[user_id] || null;
}

// Se elimina la función is_mod()
// ==============================================================================
// 4. LÓGICA DEL BOT (Funciones Clave)
// ==============================================================================

function obtenerRarezaAleatoria(pesos) {
    const elementos = Object.keys(pesos);
    const valores = Object.values(pesos);
    const sumaPesos = valores.reduce((a, b) => a + b, 0);
    let acumulado = 0;
    const rand = Math.random() * sumaPesos;

    for (let i = 0; i < elementos.length; i++) {
        acumulado += valores[i];
        if (rand < acumulado) {
            return elementos[i];
        }
    }
    return elementos[0]; // Fallback
}

function obtenerMascotaAleatoria() {
    const rareza = obtenerRarezaAleatoria(RAREZAS);
    const mascotasLista = MASCOTAS[rareza];
    const mascota = mascotasLista[Math.floor(Math.random() * mascotasLista.length)];
    return { rareza, mascota };
}

function asignarTrabajoAleatorio() {
    const trabajosLista = Object.keys(TRABAJOS);
    const trabajo = trabajosLista[Math.floor(Math.random() * trabajosLista.length)];
    const salarioBase = TRABAJOS[trabajo];
    return { trabajo, salarioBase };
}

// La función procesarComando ahora requiere el estado de moderador
function procesarComando(textoCompleto, user_id, user_name, is_moderator) {
    if (!textoCompleto.startsWith(COMANDOS_PREFIJO)) {
        return null;
    }

    const comandoCompleto = textoCompleto.substring(COMANDOS_PREFIJO.length).trim();
    const partesComando = comandoCompleto.split(/\s+/);
    const comando = partesComando[0].toLowerCase();
    const args = partesComando.slice(1);

    const db = cargarDB();
    const userData = get_user_data(db, user_id);
    
    // --- COMANDOS DE MODERACIÓN (Aseguramos el check aquí) ---
    const COMANDOS_MOD = ['ascender', 'kick', 'votar', 'close', 'cerrar', 'open', 'abrir'];

    if (COMANDOS_MOD.includes(comando)) {
        if (!is_moderator) return "❌ Permiso denegado. Solo los administradores o moderadores del grupo pueden usar este comando.";

        if (comando === 'ascender') {
            const targetId = args[0];
            const targetData = get_user_data(db, targetId);
            if (!targetData) return `❌ El usuario con ID ${targetId} no ha iniciado la economía.`;
            
            const currentIndex = RANK_ORDER.indexOf(targetData.rango);
            if (currentIndex >= RANK_ORDER.length - 1) return `🌟 ${targetData.nombre} ya está en el rango máximo.`;
            
            const nextRank = RANK_ORDER[currentIndex + 1];
            const requiredBalance = RANGOS[nextRank];
            
            if (targetData.balance < requiredBalance) {
                return `🛑 ${targetData.nombre} necesita **$${requiredBalance.toLocaleString()}** para ascender a ${nextRank}.`;
            }
            targetData.rango = nextRank;
            guardarDB(db);
            return `✨ ¡Ascenso! ${targetData.nombre} ha sido ascendido a **${nextRank}** (Balance: $${targetData.balance.toLocaleString()}).`;
        }

        if (comando === 'close' || comando === 'cerrar' || comando === 'open' || comando === 'abrir') {
            const action = (comando === 'close' || comando === 'cerrar') ? "CERRADO" : "ABIERTO";
            return `🚨 **[CONTROL DE GRUPO SIMULADO]** El grupo ha sido **${action}** para mensajes.`;
        }
        
        const targetId = args[0];
        return `✅ **[MODERACIÓN SIMULADA]** El Bot ha ejecutado la acción **${comando.toUpperCase()}** sobre el usuario **${targetId}**.`;
    }

    // --- COMANDOS DE UTILIDADES (FASE 4) ---
    if (comando === 'reglas') {
        return "📜 **REGLAS DE LA COMUNIDAD** 📜\n--------------------------------------\n1. No ignorar a nadie.\n2. No spam o flood.\n3. Nunca ignorar a un moderador.\n4. Hablar mínimo 3 veces por semana.";
    }
    if (comando === 'help') {
        let ayuda = "📚 **LISTA DE COMANDOS DEL BOT** 📚\n\n";
        ayuda += "🔸 **ECONOMÍA**\n  - #iniciar: Crea tu perfil.\n  - #perfil: Muestra tu saldo.\n  - #trabajar: Gana dinero (con cooldown).\n  - #tienda: Muestra ítems.\n  - #comprar [item]: Compra un ítem.\n\n";
        ayuda += "🔸 **UTILIDADES**\n  - #gpt [texto]: Busca y responde (Simulado).\n  - #musica_de_youtube [link]: Audio (Simulado).\n  - #reglas: Muestra las reglas.\n  - #[emoción]: Envía un GIF (ej: #risa).\n\n";
        ayuda += "🔸 **MODERACIÓN/ADMIN** (Solo Mods)\n  - #ascender [ID]: Sube de rango.\n  - #kick [ID]: Expulsa (Simulado).\n  - #close/open: Cierra/abre el grupo (Simulado).";
        return ayuda;
    }
    if (comando === 'gpt') {
        const query = args.join(' ');
        if (!query) return `Uso: ${COMANDOS_PREFIJO}gpt [pregunta].`;
        return `🤖 **[GPT-Simulación]** Busqué sobre '${query}' y la mejor respuesta es: Los resultados indican que...`;
    }
    if (comando === 'musica_de_youtube' || comando === 'youtube_audio') {
        const link = args[0];
        if (!link || !link.includes("youtube.com")) return `❌ Por favor, proporciona un enlace válido de YouTube.`;
        return `🎧 **[Audio Simulación]** Iniciando la descarga y conversión del enlace: ${link}\nEl Bot enviaría el archivo de audio.`;
    }
    if (EMOCIONES[comando]) {
        const gifFile = EMOCIONES[comando];
        return `🖼️ **[GIF]** El bot está enviando un GIF de **${comando.toUpperCase()}** (${gifFile}).`;
    }

    // --- COMANDOS DE ECONOMÍA ---
    if (comando === 'iniciar') {
        if (userData) return `¡Hola de nuevo, ${user_name}! Ya tienes un perfil económico activo.`;
        const { trabajo, salarioBase } = asignarTrabajoAleatorio();
        db[user_id] = {
            nombre: user_name, balance: 500, trabajo: trabajo, salario_por_hora: salarioBase,
            rango: "Empleado", ultima_cosecha: 0, mascotas: [], es_moderador: false, advertencias: 0
        };
        guardarDB(db);
        return `🎉 ¡Bienvenido/a al sistema, **${user_name}**! 🎉\n💼 **Trabajo inicial:** ${trabajo} / **Salario base:** $${salarioBase.toLocaleString()}`;
    }

    if (!userData) return `Debes iniciar la economía primero con ${COMANDOS_PREFIJO}iniciar.`;

    if (comando === 'perfil') {
        const mascotasInfo = userData.mascotas && userData.mascotas.length > 0
            ? userData.mascotas.map(m => `${m.nombre} (${m.rareza})`).join(', ')
            : "Ninguna";
        return `👤 **PERFIL ECONÓMICO de ${userData.nombre}**\n💰 **Balance:** $${userData.balance.toLocaleString()} | 🏅 **Rango:** ${userData.rango}\n💼 **Trabajo:** ${userData.trabajo} | 💵 **Salario/h:** $${userData.salario_por_hora.toLocaleString()}\n🐾 **Mascotas:** ${mascotasInfo}\n⚠️ **Advertencias:** ${userData.advertencias || 0}`;
    }

    if (comando === 'trabajar') {
        const currentTime = Math.floor(Date.now() / 1000);
        const timeSinceLastWork = currentTime - (userData.ultima_cosecha || 0);
        if (timeSinceLastWork < WORK_COOLDOWN) {
            const remaining = WORK_COOLDOWN - timeSinceLastWork;
            const minutes = Math.floor(remaining / 60);
            const seconds = Math.floor(remaining % 60);
            return `⏳ ¡Aún estás en jornada! Espera **${minutes}m ${seconds}s** más.`;
        }
        const horas = Math.floor(Math.random() * 3) + 1;
        const ganancia = userData.salario_por_hora * horas;
        userData.balance += ganancia;
        userData.ultima_cosecha = currentTime;
        guardarDB(db);
        return `✅ **¡${userData.nombre} ha completado su jornada de ${horas}h!** Ganancia: **$${ganancia.toLocaleString()}**. Saldo total: **$${userData.balance.toLocaleString()}**`;
    }
    
    // Simplificación de otros comandos de economía (tienda y comprar)
    if (comando === 'tienda') {
        let tiendaList = "🛍️ **TIENDA DEL BOT** 🛍️\n\n";
        for (const [item, price] of Object.entries(PRECIOS)) {
            tiendaList += `🔹 **${item}**: $${price.toLocaleString()}\n`;
        }
        tiendaList += `\nUsa ${COMANDOS_PREFIJO}comprar [item] para adquirirlo.`;
        return tiendaList;
    }

    if (comando === 'comprar') {
        const itemName = args.join(' ');
        const itemKey = Object.keys(PRECIOS).find(k => k.toLowerCase() === itemName.toLowerCase());
        if (!itemKey) return `❌ El artículo '${itemName}' no existe en la tienda.`;
        
        const costo = PRECIOS[itemKey];
        if (userData.balance < costo) return `❌ ¡No tienes suficiente dinero! Necesitas $${costo.toLocaleString()}.`;
        
        userData.balance -= costo;
        
        if (itemKey === "Huevo de Mascota") {
            const { rareza, mascota } = obtenerMascotaAleatoria();
            const nuevaMascota = { nombre: mascota, rareza: rareza, salud: 100 };
            userData.mascotas = userData.mascotas || [];
            userData.mascotas.push(nuevaMascota);
            guardarDB(db);
            return `🎉 Has eclosionado un Huevo (costo: $${costo.toLocaleString()}).\n🐾 **NUEVA MASCOTA:** ${mascota} (${rareza.toUpperCase()})\nSaldo restante: $${userData.balance.toLocaleString()}`;
        }
        
        // Simulación Caja Misteriosa
        if (itemKey === "Caja Misteriosa") {
            const gananciaCofre = Math.floor(Math.random() * 2701) + 300; // 300 a 3000
            userData.balance += gananciaCofre;
            guardarDB(db);
            return `📦 Abriste una Caja Misteriosa y ganaste $${gananciaCofre.toLocaleString()} en efectivo.\nSaldo restante: $${userData.balance.toLocaleString()}`;
        }
        
        guardarDB(db);
        return `Compraste ${itemKey} por $${costo.toLocaleString()}. ¡Gracias por tu compra!`;
    }

    return `Comando **${COMANDOS_PREFIJO}${comandoCompleto}** no reconocido. Usa ${COMANDOS_PREFIJO}help.`;
}


// ==============================================================================
// 5. INICIALIZACIÓN Y CONEXIÓN DE WHATSAPP-WEB.JS (Lógica de Moderación aquí)
// ==============================================================================

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox'],
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('SCAN THE QR CODE ABOVE');
});

client.on('ready', () => {
    console.log('Client is ready! Bot conectado a WhatsApp.');
});

client.on('message', async msg => {
    const chat = await msg.getChat();
    const senderId = msg.from; 
    const senderName = msg._data.notifyName || 'Usuario Desconocido'; 
    const textoMensaje = msg.body;
    
    // 1. Determinar si el remitente es moderador
    let is_moderator = false;
    
    // Solo se chequea moderación si el mensaje viene de un grupo
    if (chat.isGroup) {
        // Obtenemos el participante del chat (asíncrono)
        const participant = await chat.getParticipantById(senderId);
        
        // Un usuario es moderador si tiene el flag 'isAdmin' o 'isSuperAdmin'
        if (participant && (participant.isAdmin || participant.isSuperAdmin)) {
            is_moderator = true;
        }
    }

    // 2. Procesar el comando con el estado de moderador
    const respuesta = procesarComando(textoMensaje, senderId, senderName, is_moderator);

    // 3. Enviar la respuesta
    if (respuesta) {
        await chat.sendMessage(respuesta);
    }
});

client.initialize();

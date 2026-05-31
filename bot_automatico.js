const { default: makeWASocket, useMultiFileAuthState, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const http = require('http');

// Seu número configurado
const NUMERO_DO_BOT = '5583986980613'; 

// Cria o servidor web para o Render dar "Live"
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Bot Ativo! Verifique os LOGS no Render para pegar o código.</h1>');
}).listen(port, () => {
    console.log(`🌍 Porta web ativa: ${port}`);
    iniciarBot();
});

async function iniciarBot() {
    // Armazena a sessão na pasta /tmp do Render
    const { state, saveCreds } = await useMultiFileAuthState('/tmp/auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    // Evento que monitora a conexão
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            console.log('🔄 Conexão fechada, reiniciando o bot...');
            iniciarBot();
        } 
        
        else if (connection === 'open') {
            console.log('🤖 BOT ONLINE NA NUVEM E ESCUTANDO!');
        }
    });

    // Pede o código de pareamento UMA VEZ SÓ com tempo de segurança de 15 segundos
    if (!sock.authState.creds.registered) {
        console.log("⏳ Aguardando 15 segundos para estabilizar a rede antes de gerar o código...");
        setTimeout(async () => {
            try {
                let numeroLimpo = NUMERO_DO_BOT.replace(/[^0-9]/g, '');
                console.log(`📲 Solicitando código de pareamento para: ${numeroLimpo}`);
                
                let codigo = await sock.requestPairingCode(numeroLimpo);
                
                console.log(`\n==================================================`);
                console.log(`👉 SEU CÓDIGO DE CONEXÃO É:  ${codigo}  👈`);
                console.log(`==================================================\n`);
            } catch (err) {
                console.log("❌ Erro ao gerar o código. Dê um 'Manual Deploy' para tentar novamente:", err.message);
            }
        }, 15000); // 15 segundos cravados para o WhatsApp não bloquear
    }

    // Código das figurinhas (Mantido igual e funcional)
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.endsWith('@g.us')) return;

        const jid = msg.key.remoteJid;
        const messageType = Object.keys(msg.message)[0];
        const caption = msg.message[messageType]?.caption || '';

        if (messageType === 'imageMessage' && (caption === '!s' || caption === '!f')) {
            console.log(`📸 Processando foto recebida na nuvem...`);
            const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
            
            const inputPath = '/tmp/temp_input.jpg';
            const outputPath = '/tmp/figurinha.webp';
            fs.writeFileSync(inputPath, buffer);

            exec(`ffmpeg -y -i ${inputPath} -vcodec libwebp -vf "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000" ${outputPath}`, async (error) => {
                if (error) { console.log('❌ Erro no FFmpeg:', error); return; }

                try {
                    await sock.sendMessage(jid, { sticker: fs.readFileSync(outputPath) });
                    console.log('✅ Figurinha enviada com sucesso!');
                } catch (err) {
                    console.log('❌ Erro ao enviar:', err);
                }

                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            });
        }
    });
}

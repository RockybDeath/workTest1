import makeWASocket, {
	DisconnectReason,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState
} from '../src'
import { Boom } from '@hapi/boom'
import MAIN_LOGGER from '../src/Utils/logger'
import { makeInMemoryStore } from '../lib'

const logger = MAIN_LOGGER.child({ })
logger.level = 'trace'

const store = makeInMemoryStore({})

store.readFromFile('./baileys_store.json')

setInterval(() => {
	store.writeToFile('./baileys_store.json')
}, 10_000)

const startConnect = async() => {

	const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')

	const { version } = await fetchLatestBaileysVersion()
	async function connectToWhatsApp() {
		const sock = makeWASocket({
			version,
			emitOwnEvents: true,
			syncFullHistory: true,
			auth: {
				creds: state.creds,
				/** caching makes the store faster to send/recv messages */
				keys: makeCacheableSignalKeyStore(state.keys, logger),
			},
			// can provide additional config here
			printQRInTerminal: true
		})
		store.bind(sock.ev)

		sock.ev.on('chats.upsert', () => {
			// can use "store.chats" however you want, even after the socket dies out
			// "chats" => a KeyedDB instance
			console.log('got chats', store.chats.all())
		})
		sock.ev.on('creds.update', saveCreds)
		sock.ev.on('presence.update', json => console.log(json))
		sock.ev.on('messaging-history.set', m => {
			console.log(m)
		})
		sock.ev.on('connection.update', (update) => {
			const { connection, lastDisconnect } = update
			if(connection === 'close' && lastDisconnect !== undefined) {
				const shouldReconnect = (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
				console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect)
				// reconnect if not logged out
				if(shouldReconnect) {
					connectToWhatsApp()
				}
			} else if(connection === 'open') {
				console.log('opened connection')
				// '79522173731@s.whatsapp.net'
				sock.fetchPrivacySettings(true).then(profileInfo => {
					console.log(profileInfo)
				})
				sock.getCollections('79522173731@s.whatsapp.net').then(e => {
					console.log(e)
				})
			}
		})
		sock.ev.on('messages.upsert', m => {
			// console.log(JSON.stringify(m, undefined, 2))
			console.log(m.messages)

			console.log('replying to', m.messages[0].key.remoteJid)
			// sock.sendMessage(m.messages[0].key.remoteJid!, { text: 'Argh!' })
		})

		// const status = await sock.fetchStatus('7952173731@s.whatsapp.net')
		// console.log('status: ' + status)

		// sock.getBusinessProfile('79522173731@s.whatsapp.net').catch(e => console.log(e)).then(e => {
		// 	console.log(e)
		// }).catch(e => console.log(e))
		return sock
	}

	// run in main file
	connectToWhatsApp()
}


startConnect()

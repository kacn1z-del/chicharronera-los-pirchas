// api/cambiar-password.js
//
// Función serverless de Vercel para cambiar la contraseña de una cuenta de
// staff ya existente (Firebase Authentication), sin necesitar la consola de
// Firebase ni una terminal. Solo puede usarla alguien ya logueado como
// "admin". Mismo patrón que api/crear-usuario.js.
//
// POST /api/cambiar-password
//   headers: Authorization: Bearer <ID token de quien está logueado>
//   body: { uid, password }

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { JWT } from 'google-auth-library'

const PROJECT_ID = 'acosta-food'
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/default/documents`

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  initializeApp({ credential: cert(serviceAccount) })
}

let authClient = null
function getFirestoreAuthClient() {
  if (!authClient) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    authClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/datastore'],
    })
  }
  return authClient
}

function fromFirestoreValue(value) {
  if (value == null) return null
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('booleanValue' in value) return value.booleanValue
  return null
}

function fromFirestoreFields(fields) {
  const out = {}
  for (const key of Object.keys(fields || {})) {
    out[key] = fromFirestoreValue(fields[key])
  }
  return out
}

async function getDocument(client, path) {
  try {
    const res = await client.request({ url: `${FIRESTORE_BASE}/${path}` })
    return fromFirestoreFields(res.data.fields || {})
  } catch (err) {
    throw new Error(
      `DIAG BASE=${FIRESTORE_BASE} getDocument(${path}) status=${err.response?.status} body=${JSON.stringify(err.response?.data)}`
    )
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { uid, password } = req.body || {}
  if (!uid || !password) {
    return res.status(400).json({ error: 'Faltan datos (uid, password)' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }

  const authHeader = req.headers.authorization || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!idToken) {
    return res.status(401).json({ error: 'Falta iniciar sesión' })
  }

  try {
    const decoded = await getAuth().verifyIdToken(idToken)
    const firestoreClient = getFirestoreAuthClient()

    const callerStaff = await getDocument(firestoreClient, `staff/${decoded.uid}`)
    if (!callerStaff || callerStaff.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo un administrador puede cambiar contraseñas' })
    }

    await getAuth().updateUser(uid, { password })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Error cambiando contraseña:', err)
    const message = err.errorInfo?.message || err.message
    return res.status(500).json({ error: message })
  }
}

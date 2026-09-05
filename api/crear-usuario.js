// api/crear-usuario.js
//
// Función serverless de Vercel para crear cuentas de staff (Firebase
// Authentication + su rol en Firestore) sin necesitar la consola de Firebase
// ni una terminal. Solo puede usarla alguien ya logueado como "admin".
//
// POST /api/crear-usuario
//   headers: Authorization: Bearer <ID token de quien está logueado>
//   body: { usuario, nombre, password, rol }   // rol: "admin" | "invitado"

import { JWT } from 'google-auth-library'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const PROJECT_ID = 'acosta-food'
// OJO: el ID real de la base de datos por defecto en Firestore es "(default)",
// con paréntesis incluidos — no "default" a secas.
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

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

// --- Conversión entre valores planos de JS y el formato tipado de Firestore REST ---
function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  return { nullValue: null }
}

function toFirestoreFields(obj) {
  const fields = {}
  for (const key of Object.keys(obj)) {
    fields[key] = toFirestoreValue(obj[key])
  }
  return fields
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
    if (err.response?.status === 404) return null
    throw err
  }
}

async function patchDocument(client, path, fields) {
  const mask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&')
  await client.request({
    url: `${FIRESTORE_BASE}/${path}?${mask}`,
    method: 'PATCH',
    data: { fields: toFirestoreFields(fields) },
  })
}

// Mismo criterio que en LoginScreen.jsx: si no escriben un correo completo,
// se arma uno "interno" con el dominio de staff.
function toStaffEmail(input) {
  const clean = input.trim().toLowerCase()
  return clean.includes('@') ? clean : `${clean}@staff.lospirchas.com`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { usuario, nombre, password, rol } = req.body || {}
  if (!usuario || !nombre || !password || !rol) {
    return res.status(400).json({ error: 'Faltan datos (usuario, nombre, password, rol)' })
  }
  if (!['admin', 'invitado'].includes(rol)) {
    return res.status(400).json({ error: 'El rol debe ser "admin" o "invitado"' })
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
      return res.status(403).json({
        error: `Solo un administrador puede crear usuarios nuevos [DIAG uid=${decoded.uid} callerStaff=${JSON.stringify(callerStaff)}]`,
      })
    }

    const email = toStaffEmail(usuario)
    const newUser = await getAuth().createUser({ email, password, displayName: nombre })

    await patchDocument(firestoreClient, `staff/${newUser.uid}`, {
      nombre,
      email,
      rol,
      createdAt: new Date().toISOString(),
    })

    return res.status(200).json({ ok: true, uid: newUser.uid, email })
  } catch (err) {
    console.error('Error creando usuario:', err)
    const message =
      err.code === 'auth/email-already-exists'
        ? 'Ya existe una cuenta con ese usuario'
        : err.errorInfo?.message || err.message
    return res.status(500).json({ error: message })
  }
}

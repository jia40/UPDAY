import { getFirestore } from 'firebase/firestore'
import { app } from './firebase'

// Only data screens import this module; public auth routes never initialize Firestore.
export const db = getFirestore(app)

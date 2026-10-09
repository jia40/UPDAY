import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore'

test('interview rules protect ownership, creation time and review timestamps', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const apps = []
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const client = uid => {
    const app = initializeApp({ projectId: 'demo-upday' }, `interview-${uid ?? 'anonymous'}`)
    apps.push(app)
    const db = getFirestore(app)
    connectFirestoreEmulator(db, host, Number(port), uid ? { mockUserToken: { sub: uid } } : {})
    return db
  }
  const owner = client('interview-owner'), other = client('interview-other'), guest = client(null)
  const ref = db => doc(db, 'interviewQuestions', 'rules-question')
  const deny = promise => assert.rejects(promise, error => error.code === 'permission-denied')
  const input = { userId: 'interview-owner', question: 'question', answer: '', tags: ['React'], status: 'unknown', lastReviewedAt: null, createdAt: serverTimestamp() }
  try {
    await setDoc(ref(owner), input)
    const createdAt = (await getDoc(ref(owner))).data().createdAt
    await updateDoc(ref(owner), { answer: 'answer', tags: ['CS'] })
    for (const status of ['learning', 'explainable', 'unknown']) await updateDoc(ref(owner), { status })
    await updateDoc(ref(owner), { lastReviewedAt: serverTimestamp() })
    const saved = (await getDoc(ref(owner))).data()
    assert.ok(saved.lastReviewedAt instanceof Timestamp)
    assert.ok(saved.createdAt.isEqual(createdAt))
    for (const db of [other, guest]) {
      await deny(getDoc(ref(db)))
      await deny(updateDoc(ref(db), { answer: 'stolen' }))
      await deny(deleteDoc(ref(db)))
    }
    for (const change of [{ userId: 'interview-other' }, { createdAt: serverTimestamp() }, { status: 'invalid' }, { lastReviewedAt: null }, { lastReviewedAt: Timestamp.fromMillis(1) }, { question: '' }, { tags: ['CS', 'CS'] }, { extra: true }]) await deny(updateDoc(ref(owner), change))
    await deny(setDoc(doc(owner, 'interviewQuestions', 'invalid-initial-status'), { ...input, status: 'learning' }))
    await deleteDoc(ref(owner))
  } finally { await Promise.all(apps.map(deleteApp)) }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore'

test('application rules protect ownership, fields, dates and immutable creation', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const apps = []
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const client = uid => {
    const app = initializeApp({ projectId: 'demo-upday' }, `job-${uid ?? 'guest'}`)
    apps.push(app)
    const db = getFirestore(app)
    connectFirestoreEmulator(db, host, Number(port), uid ? { mockUserToken: { sub: uid } } : {})
    return db
  }
  const owner = client('job-owner'), other = client('job-other'), guest = client(null)
  const ref = db => doc(db, 'applications', 'rules-application')
  const deny = promise => assert.rejects(promise, error => error.code === 'permission-denied')
  const input = { userId: 'job-owner', company: 'company', position: 'developer', url: '', status: 'interested', appliedAt: '', memo: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
  try {
    await setDoc(ref(owner), input)
    const createdAt = (await getDoc(ref(owner))).data().createdAt
    for (const status of ['planned', 'applied', 'screening', 'coding', 'interview', 'accepted', 'rejected', 'interested']) await updateDoc(ref(owner), { status, updatedAt: serverTimestamp() })
    await updateDoc(ref(owner), { company: 'changed', appliedAt: '2024-02-29', url: 'https://example.com/jobs', memo: 'memo', updatedAt: serverTimestamp() })
    assert.ok((await getDoc(ref(owner))).data().createdAt.isEqual(createdAt))
    for (const db of [other, guest]) {
      await deny(getDoc(ref(db)))
      await deny(updateDoc(ref(db), { memo: 'stolen', updatedAt: serverTimestamp() }))
      await deny(deleteDoc(ref(db)))
      await deny(setDoc(doc(db, 'applications', 'unauthorized'), input))
    }
    for (const change of [{ userId: 'job-other' }, { createdAt: Timestamp.fromMillis(1) }, { updatedAt: Timestamp.fromMillis(1) }, { status: 'invalid' }, { company: '' }, { position: ' ' }, { url: 'javascript:alert(1)' }, { appliedAt: '2026-02-30' }, { appliedAt: '9999-01-01' }, { memo: 'x'.repeat(10001) }, { extra: true }]) await deny(updateDoc(ref(owner), { updatedAt: serverTimestamp(), ...change }))
    await deleteDoc(ref(owner))
  } finally { await Promise.all(apps.map(deleteApp)) }
})

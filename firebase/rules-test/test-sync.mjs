// בדיקות לחוקים של הצפייה המשותפת (kr_sync) של kupa-rashit
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId: 'demo-rm', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
let pass = 0, fail = 0;
const T = async (name, p) => { try { await p; pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e.message).split('\n')[0]); } };
const ok = (n, p) => T(n, assertSucceeds(p)), no = (n, p) => T(n, assertFails(p));
const anon = env.unauthenticatedContext().firestore();
const room = (o = {}) => ({ v: 2, lag: 7300, at: serverTimestamp(), ...o });
const peer = (o = {}) => ({ at: serverTimestamp(), err: 12, host: false, ...o });

console.log('--- חדרים');
await no('short room id', setDoc(doc(anon, 'kr_sync/abc'), room()));
await no('room id with symbols', setDoc(doc(anon, 'kr_sync/abcdefghij-k'), room()));
await no('negative lag', setDoc(doc(anon, 'kr_sync/R0000000001'), room({ lag: -5 })));
await no('huge lag', setDoc(doc(anon, 'kr_sync/R0000000001'), room({ lag: 9e9 })));
await no('string lag', setDoc(doc(anon, 'kr_sync/R0000000001'), room({ lag: '5' })));
await no('client time', setDoc(doc(anon, 'kr_sync/R0000000001'), room({ at: 5 })));
await no('extra field', setDoc(doc(anon, 'kr_sync/R0000000001'), room({ x: 1 })));
await no('missing lag', setDoc(doc(anon, 'kr_sync/R0000000001'), { v: 2, at: serverTimestamp() }));
await ok('anon creates room', setDoc(doc(anon, 'kr_sync/R0000000001'), room()));
await ok('anon reads room', getDoc(doc(anon, 'kr_sync/R0000000001')));
await no('cannot change room', setDoc(doc(anon, 'kr_sync/R0000000001'), room({ lag: 1 })));
await no('cannot update room', updateDoc(doc(anon, 'kr_sync/R0000000001'), { lag: 1 }));
await no('cannot delete room', deleteDoc(doc(anon, 'kr_sync/R0000000001')));
await no('cannot list rooms', getDocs(collection(anon, 'kr_sync')));

console.log('--- נוכחות');
await no('peer in missing room', setDoc(doc(anon, 'kr_sync/R0000000099/peers/P00000001'), peer()));
await no('peer bad id', setDoc(doc(anon, 'kr_sync/R0000000001/peers/p'), peer()));
await no('peer client time', setDoc(doc(anon, 'kr_sync/R0000000001/peers/P00000001'), peer({ at: 1 })));
await no('peer extra field', setDoc(doc(anon, 'kr_sync/R0000000001/peers/P00000001'), peer({ name: 'x' })));
await no('peer negative err', setDoc(doc(anon, 'kr_sync/R0000000001/peers/P00000001'), peer({ err: -1 })));
await ok('peer joins', setDoc(doc(anon, 'kr_sync/R0000000001/peers/P00000001'), peer()));
await ok('peer heartbeat', setDoc(doc(anon, 'kr_sync/R0000000001/peers/P00000001'), peer({ err: 3, host: true })));
await ok('list peers', getDocs(collection(anon, 'kr_sync/R0000000001/peers')));
await ok('peer leaves', deleteDoc(doc(anon, 'kr_sync/R0000000001/peers/P00000001')));

console.log('--- שאר החוקים לא נפתחו');
await no('anon still cannot write sites', setDoc(doc(anon, 'sites/x'), { a: 1 }));
await no('anon still cannot read unknown', getDocs(collection(anon, 'other_stuff')));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);

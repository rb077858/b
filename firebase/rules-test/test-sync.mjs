// בדיקות לחוקים של הצפייה המשותפת (kr_sync) של kupa-rashit
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId: 'demo-rm', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
let pass = 0, fail = 0;
const T = async (name, p) => { try { await p; pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e.message).split('\n')[0]); } };
const ok = (n, p) => T(n, assertSucceeds(p)), no = (n, p) => T(n, assertFails(p));
const anon = env.unauthenticatedContext().firestore();
const owner = env.authenticatedContext('uOwner', {}).firestore();
const other = env.authenticatedContext('uOther', {}).firestore();
const st = (o = {}) => ({ v: 3, owner: 'uOwner', wall: 1795377573000, abs: 1795377566000, rate: 1, paused: false, ended: false, rev: 0, at: serverTimestamp(), ...o });
const peer = (o = {}) => ({ at: serverTimestamp(), err: 12, host: false, ...o });
const R = 'kr_sync/R0000000001';

console.log('--- יצירת חדר');
await no('anon (not signed in) cannot create', setDoc(doc(anon, R), st()));
await no('owner must be me', setDoc(doc(other, R), st()));
await no('short room id', setDoc(doc(owner, 'kr_sync/abc'), st()));
await no('room id with symbols', setDoc(doc(owner, 'kr_sync/abcdefghij-k'), st()));
await no('rate too high', setDoc(doc(owner, R), st({ rate: 10 })));
await no('string abs', setDoc(doc(owner, R), st({ abs: '5' })));
await no('client time', setDoc(doc(owner, R), st({ at: 5 })));
await no('extra field', setDoc(doc(owner, R), st({ x: 1 })));
await no('rev must start at 0', setDoc(doc(owner, R), st({ rev: 3 })));
await no('cannot create ended', setDoc(doc(owner, R), st({ ended: true })));
await no('missing paused', setDoc(doc(owner, R), (({ paused, ...r }) => r)(st())));
await ok('owner creates room', setDoc(doc(owner, R), st()));
await ok('anyone reads room', getDoc(doc(anon, R)));
await no('cannot list rooms', getDocs(collection(anon, 'kr_sync')));

console.log('--- שינויים');
await ok('owner pauses (rev 1)', setDoc(doc(owner, R), st({ paused: true, rev: 1 })));
await no('owner same rev', setDoc(doc(owner, R), st({ paused: false, rev: 1 })));
await no('owner lower rev', setDoc(doc(owner, R), st({ rev: 0 })));
await ok('owner seeks (rev 2)', setDoc(doc(owner, R), st({ abs: 1795377500000, rev: 2 })));
await no('guest (anon) cannot change', setDoc(doc(anon, R), st({ rev: 3 })));
await no('other user cannot change', setDoc(doc(other, R), st({ owner: 'uOther', rev: 3 })));
await no('owner cannot hand over', updateDoc(doc(owner, R), { owner: 'uOther', rev: 3 }));
await no('nobody deletes', deleteDoc(doc(owner, R)));
await ok('owner ends (rev 3)', setDoc(doc(owner, R), st({ ended: true, rev: 3 })));
await no('no changes after end', setDoc(doc(owner, R), st({ ended: false, rev: 4 })));

console.log('--- נוכחות');
await no('peer in missing room', setDoc(doc(anon, 'kr_sync/R0000000099/peers/P00000001'), peer()));
await no('peer bad id', setDoc(doc(anon, R + '/peers/p'), peer()));
await no('peer client time', setDoc(doc(anon, R + '/peers/P00000001'), peer({ at: 1 })));
await no('peer extra field', setDoc(doc(anon, R + '/peers/P00000001'), peer({ name: 'x' })));
await no('peer negative err', setDoc(doc(anon, R + '/peers/P00000001'), peer({ err: -1 })));
await ok('peer joins', setDoc(doc(anon, R + '/peers/P00000001'), peer()));
await ok('peer heartbeat', setDoc(doc(anon, R + '/peers/P00000001'), peer({ err: 3, host: true })));
await ok('list peers', getDocs(collection(anon, R + '/peers')));
await ok('peer leaves', deleteDoc(doc(anon, R + '/peers/P00000001')));

console.log('--- שאר החוקים לא נפתחו');
await no('anon still cannot write sites', setDoc(doc(anon, 'sites/x'), { a: 1 }));
await no('anon still cannot read unknown', getDocs(collection(anon, 'other_stuff')));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);

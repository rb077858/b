// בדיקות לחוקים של "תורנויות חדר" (ch_*)
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';
const env = await initializeTestEnvironment({ projectId: 'demo-ch', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
let pass = 0, fail = 0;
const T = async (name, p) => { try { await p; pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e.message).split('\n')[0]); } };
const ok = (n, p) => T(n, assertSucceeds(p)), no = (n, p) => T(n, assertFails(p));
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'ch_members/a@x.com'), { email: 'a@x.com', room: '41', name: 'א' });
  await setDoc(doc(db, 'ch_members/b@x.com'), { email: 'b@x.com', room: '42', name: 'ב' });
  await setDoc(doc(db, 'ch_rooms/42'), { room: '42', residents: [] });
  await setDoc(doc(db, 'ch_events/e42'), { type: 'off', from: '2026-11-20', to: '2026-11-20', title: '', by: 'b@x.com', byRoom: '42', at: 1 });
});
const anon = env.unauthenticatedContext().firestore();
const A = env.authenticatedContext('uA', { email: 'a@x.com', email_verified: true }).firestore();
const AU = env.authenticatedContext('uA2', { email: 'A@X.com', email_verified: true }).firestore();
const AF = env.authenticatedContext('uAf', { email: 'a@x.com', email_verified: false }).firestore();
const O = env.authenticatedContext('uO', { email: 'out@x.com', email_verified: true }).firestore();
const ADM = env.authenticatedContext('uAdm', { email: 'rb077858@gmail.com', email_verified: true }).firestore();

console.log('--- ch_members');
await ok('read own member', getDoc(doc(A, 'ch_members/a@x.com')));
await ok('uppercase email reads own', getDoc(doc(AU, 'ch_members/a@x.com')));
await no('read other member', getDoc(doc(A, 'ch_members/b@x.com')));
await no('list members', getDocs(collection(A, 'ch_members')));
await no('outsider reads (nonexistent own)', getDoc(doc(O, 'ch_members/b@x.com')));
await ok('outsider reads own (nonexistent)', getDoc(doc(O, 'ch_members/out@x.com')));
await no('self-add', setDoc(doc(O, 'ch_members/out@x.com'), { email: 'out@x.com', room: '41' }));
await no('change own room', updateDoc(doc(A, 'ch_members/a@x.com'), { room: '42' }));
await ok('admin adds', setDoc(doc(ADM, 'ch_members/c@x.com'), { email: 'c@x.com', room: '43' }));
await ok('admin lists', getDocs(collection(ADM, 'ch_members')));

console.log('--- ch_rooms');
await ok('create own room', setDoc(doc(A, 'ch_rooms/41'), { room: '41', residents: [{ id: '1', name: 'x' }], absences: [], events: [] }));
await ok('update own room', updateDoc(doc(A, 'ch_rooms/41'), { absences: [{ id: 'a', rid: '1', from: '2026-11-17', to: null, reason: 'sick' }] }));
await ok('read own room', getDoc(doc(A, 'ch_rooms/41')));
await no('read other room', getDoc(doc(A, 'ch_rooms/42')));
await no('write other room', setDoc(doc(A, 'ch_rooms/42'), { room: '42' }));
await no('unverified email', getDoc(doc(AF, 'ch_rooms/41')));
await no('outsider', getDoc(doc(O, 'ch_rooms/41')));
await no('anon', getDoc(doc(anon, 'ch_rooms/41')));
await ok('write own day', setDoc(doc(A, 'ch_rooms/41/days/2026-11-17'), { date: '2026-11-17', tasks: [], assign: {}, done: {} }));
await no('write other day', setDoc(doc(A, 'ch_rooms/42/days/2026-11-17'), { date: '2026-11-17' }));
await ok('admin reads any room', getDoc(doc(ADM, 'ch_rooms/41')));

console.log('--- ch_duties');
const duty = (o = {}) => ({ date: '2026-11-17', floor: ['37', '41', '45'], kitchen: ['39'], raw: 'x', time: '07:56', sender: 'נדב', newRound: false, by: 'a@x.com', byRoom: '41', at: serverTimestamp(), ...o });
await ok('member pastes duty', setDoc(doc(A, 'ch_duties/2026-11-17'), duty()));
await ok('member reads duties', getDocs(collection(A, 'ch_duties')));
await no('outsider reads duties', getDocs(collection(O, 'ch_duties')));
await no('date mismatch', setDoc(doc(A, 'ch_duties/2026-11-18'), duty()));
await no('spoof room', setDoc(doc(A, 'ch_duties/2026-11-17'), duty({ byRoom: '42' })));
await no('spoof by', setDoc(doc(A, 'ch_duties/2026-11-17'), duty({ by: 'b@x.com' })));
await no('extra field', setDoc(doc(A, 'ch_duties/2026-11-17'), duty({ x: 1 })));
await no('too many rooms', setDoc(doc(A, 'ch_duties/2026-11-17'), duty({ floor: ['1', '2', '3', '4', '5', '6', '7'] })));
await no('member deletes duty', deleteDoc(doc(A, 'ch_duties/2026-11-17')));
await ok('admin deletes duty', deleteDoc(doc(ADM, 'ch_duties/2026-11-17')));

console.log('--- ch_events');
const ev = (o = {}) => ({ type: 'off', from: '2026-11-18', to: '2026-11-18', title: 'טיול', by: 'a@x.com', byRoom: '41', at: 1, ...o });
await ok('member adds event', addDoc(collection(A, 'ch_events'), ev()));
await no('bad type', addDoc(collection(A, 'ch_events'), ev({ type: 'hack' })));
await no('spoof room', addDoc(collection(A, 'ch_events'), ev({ byRoom: '42' })));
await no('outsider adds', addDoc(collection(O, 'ch_events'), ev({ by: 'out@x.com' })));
await no('delete other room event', deleteDoc(doc(A, 'ch_events/e42')));
await ok('admin deletes any event', deleteDoc(doc(ADM, 'ch_events/e42')));
await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'ch_events/e41'), ev()));
await ok('delete own room event', deleteDoc(doc(A, 'ch_events/e41')));

console.log('--- ch_tokens');
const tok = (o = {}) => ({ email: 'a@x.com', room: '41', notifyTime: '07:00', morning: true, duty: true, ua: 'x', at: serverTimestamp(), ...o });
await ok('register token', setDoc(doc(A, 'ch_tokens/tok1'), tok()));
await ok('update prefs', setDoc(doc(A, 'ch_tokens/tok1'), tok({ notifyTime: '07:15' })));
await no('wrong room', setDoc(doc(A, 'ch_tokens/tok2'), tok({ room: '42' })));
await no('wrong email', setDoc(doc(A, 'ch_tokens/tok2'), tok({ email: 'b@x.com' })));
await no('outsider token', setDoc(doc(O, 'ch_tokens/tok3'), tok({ email: 'out@x.com' })));
await no('other reads token', getDoc(doc(env.authenticatedContext('uB', { email: 'b@x.com', email_verified: true }).firestore(), 'ch_tokens/tok1')));
await ok('delete own token', deleteDoc(doc(A, 'ch_tokens/tok1')));

console.log('--- sites/cheder');
await ok('anon reads settings', getDoc(doc(anon, 'sites/cheder')));
await no('member writes settings', setDoc(doc(A, 'sites/cheder'), { vapidKey: 'x' }));
await ok('admin writes settings', setDoc(doc(ADM, 'sites/cheder'), { vapidKey: 'x' }));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);

/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({listener:null as null|((user:unknown)=>Promise<void>),auth:{currentUser:null as unknown},getDoc:vi.fn(),setDoc:vi.fn(),toast:vi.fn()}));
vi.mock('@/lib/firebase-auth',()=>({auth:f.auth}));
vi.mock('@/lib/firebase-firestore',()=>({db:{}}));
vi.mock('firebase/auth',()=>({onAuthStateChanged:(_auth:unknown,cb:(user:unknown)=>Promise<void>)=>{f.listener=cb;return vi.fn();}, signInWithPopup:vi.fn(),GoogleAuthProvider:class{},signOut:vi.fn(),createUserWithEmailAndPassword:vi.fn(),signInWithEmailAndPassword:vi.fn(),updateProfile:vi.fn()}));
vi.mock('firebase/firestore',()=>({doc:(_db:unknown,_collection:string,uid:string)=>uid,getDoc:f.getDoc,setDoc:f.setDoc}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:f.toast})}));
vi.mock('@/components/onboarding/OnboardingTour',()=>({OnboardingTour:()=>null}));
import {AuthProvider,useAuth} from './AuthContext';
function Probe(){const {user,profile}=useAuth();return <div>{user?.uid}:{profile?.displayName ?? 'none'}</div>;}
const alice={uid:'alice',displayName:'Alice',email:null,photoURL:null},bob={uid:'bob',displayName:'Bob',email:null,photoURL:null};
afterEach(()=>{localStorage.clear();vi.clearAllMocks();f.listener=null;f.auth.currentUser=null;});
describe('profile state on authentication changes',()=>{
  it('does not attach an earlier account profile after switching users',async()=>{
    (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    localStorage.setItem('brain-drain-onboarded','1');
    let resolveAlice!: (value:unknown)=>void;
    f.getDoc.mockImplementation((uid:string)=>uid==='alice'?new Promise(resolve=>{resolveAlice=resolve;}):Promise.resolve({exists:()=>true,data:()=>({id:'bob',displayName:'Bob profile'})}));
    const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
    try {
      await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));
      await vi.waitFor(()=>expect(f.listener).not.toBeNull());
      f.auth.currentUser=alice;let a:Promise<void>;
      await act(async()=>{a=f.listener!(alice);await Promise.resolve();});
      await vi.waitFor(()=>expect(resolveAlice).toBeDefined());
      f.auth.currentUser=bob;await act(async()=>{await f.listener!(bob);});
      expect(el.textContent).toContain('bob:Bob profile');
      await act(async()=>{resolveAlice({exists:()=>true,data:()=>({id:'alice',displayName:'Alice profile'})});await a!;});
      expect(el.textContent).toContain('bob:Bob profile');expect(el.textContent).not.toContain('Alice profile');
    } finally {await act(async()=>root.unmount());el.remove();}
  });
});

it('clears the previous profile immediately while the next profile is loading',async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  localStorage.setItem('brain-drain-onboarded','1');
  let resolveBob!:(value:unknown)=>void;
  f.getDoc.mockImplementation((uid:string)=>uid==='bob'?new Promise(resolve=>{resolveBob=resolve;}):Promise.resolve({exists:()=>true,data:()=>({id:'alice',displayName:'Alice profile'})}));
  const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
  try {
    await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));await vi.waitFor(()=>expect(f.listener).not.toBeNull());
    f.auth.currentUser=alice;await act(async()=>{await f.listener!(alice);});expect(el.textContent).toContain('alice:Alice profile');
    f.auth.currentUser=bob;let pending:Promise<void>;
    await act(async()=>{pending=f.listener!(bob);await Promise.resolve();});
    await vi.waitFor(()=>expect(resolveBob).toBeDefined());
    expect(el.textContent).toContain('bob:none');expect(el.textContent).not.toContain('Alice profile');
    await act(async()=>{resolveBob({exists:()=>true,data:()=>({id:'bob',displayName:'Bob profile'})});await pending!;});
    expect(el.textContent).toContain('bob:Bob profile');
  }finally{await act(async()=>root.unmount());el.remove();}
});

it('does not restore a profile after sign-out while its read is in flight',async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  localStorage.setItem('brain-drain-onboarded','1');let finish!:(value:unknown)=>void;
  f.getDoc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
  try {
    await act(async()=>root.render(<AuthProvider><Probe/></AuthProvider>));await vi.waitFor(()=>expect(f.listener).not.toBeNull());
    f.auth.currentUser=alice;let pending:Promise<void>;await act(async()=>{pending=f.listener!(alice);await Promise.resolve();});await vi.waitFor(()=>expect(finish).toBeDefined());
    f.auth.currentUser=null;await act(async()=>{await f.listener!(null);});
    await act(async()=>{finish({exists:()=>true,data:()=>({id:'alice',displayName:'Alice profile'})});await pending!;});
    expect(el.textContent).not.toContain('Alice profile');expect(el.textContent).not.toContain('alice:');
  }finally{await act(async()=>root.unmount());el.remove();}
});

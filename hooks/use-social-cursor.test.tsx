/** @vitest-environment happy-dom */
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('../lib/api/feed',()=>({fetchFeed:m.fetch,createPost:vi.fn(),toCreatePostInput:vi.fn(),reactToPost:vi.fn(),isApiError:()=>false}));
vi.mock('./use-online-status',()=>({useOnlineStatus:()=> 'online'}));
vi.mock('./use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
import {useSocial} from './use-social';
let api:ReturnType<typeof useSocial>,client:QueryClient,root:ReturnType<typeof createRoot>,el:HTMLDivElement;
function Probe(){const social=useSocial();useEffect(()=>{api=social;});return null;}
beforeEach(async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.resetAllMocks();client=new QueryClient({defaultOptions:{queries:{retry:false}}});el=document.createElement('div');document.body.append(el);root=createRoot(el);
});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();el.remove();});
describe('feed keyset hook',()=>{
 it('passes the server cursor unchanged to the next page',async()=>{
  const cursor={id:'b',createdAt:'2026-11-16T12:00:00.123456+00:00'};
  m.fetch.mockResolvedValueOnce({posts:[],hasMore:true,nextCursor:cursor}).mockResolvedValueOnce({posts:[],hasMore:false,nextCursor:null});
  await act(async()=>root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>));
  await vi.waitFor(()=>expect(api.hasNextPage).toBe(true));
  await act(async()=>{await api.fetchNextPage();});
  expect(m.fetch).toHaveBeenCalledTimes(2);
  expect(m.fetch.mock.calls[0][0]).toMatchObject({cursor:null});
  expect(m.fetch.mock.calls[1][0]).toMatchObject({cursor});
  expect(m.fetch.mock.calls[1][0]).not.toHaveProperty('offset');
 });
});

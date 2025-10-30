import useSWR, { mutate as globalMutate } from 'swr';
import { apiGet } from './fetcher';

type MeResp = { ok: boolean; user?: { id:string; userId:string; userName:string|null; iconDataUrl:string|null; totpEnabled:boolean } };

export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<MeResp>('/api/auth/me', apiGet, {
    revalidateOnFocus: true,
    revalidateIfStale: true,
    revalidateOnReconnect: true,
  });
  return {
    me: data?.ok ? data.user : null,
    isLoading,
    error,
    refresh: () => mutate(),
  };
}

// アイコンやプロフィール更新後に全体再描画したいとき用
export function refreshMeGlobally() {
  return globalMutate('/api/auth/me');
}

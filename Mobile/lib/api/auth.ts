import { erpClient } from './client';
import type { LoginInput, LoginResponse, Usuario } from '@/lib/auth/types';

export async function login(input: LoginInput): Promise<LoginResponse> {
  const { data } = await erpClient.post<LoginResponse>('/gen/auth/login', {
    login: input.loginOrEmail,
    password: input.password,
  });
  return data;
}

export async function fetchMe(): Promise<Usuario> {
  const { data } = await erpClient.get<Usuario>('/gen/auth/me');
  return data;
}
